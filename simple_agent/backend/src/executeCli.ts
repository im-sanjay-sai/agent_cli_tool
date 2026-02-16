import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

const TIMEOUT_MS = 120_000; // 2 min — the proxy chain (CLI → /api/quill → DB) can be slow

// Run CLI from the backend root so it finds .quill/config.json
const BACKEND_ROOT = resolve(__dirname, '..');

// Flags that accept a file path -- if the next arg is inline JSON, write to temp file
const FILE_FLAGS = ['--file', '--ast', '--filters'];

/**
 * Safely execute a Quill CLI command.
 *
 * Features:
 *  - Uses execFile (no shell) to avoid injection
 *  - Async to not block the event loop
 *  - Auto-writes inline JSON to temp files for --file/--ast/--filters flags
 *  - Cleans up temp files after execution
 */
export async function executeCli(args: { command: string }): Promise<string> {
  const { command } = args;
  const trimmed = command.trim();

  // Safety: only allow quill commands
  if (!trimmed.startsWith('quill ') && trimmed !== 'quill') {
    return JSON.stringify({
      ok: false,
      error: {
        code: 'INVALID_COMMAND',
        message: `Only quill CLI commands are allowed. Received: "${trimmed}"`,
      },
    });
  }

  // Split command into binary + args safely (no shell involved)
  const parts = parseCommand(trimmed);
  const binary = parts[0]; // "quill"
  const cliArgs = parts.slice(1);

  // Write inline JSON to temp files for --file, --ast, --filters flags
  const tempFiles = materializeInlineJson(cliArgs);

  return new Promise((promiseResolve) => {
    execFile(
      binary,
      cliArgs,
      {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        cwd: BACKEND_ROOT, // So the CLI finds .quill/config.json
        env: {
          ...process.env,
          CI: 'true', // Force non-interactive mode
          QUILL_API_TOKEN:
            process.env.QUILL_API_TOKEN || process.env.QUILL_PRIVATE_KEY || '',
        },
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer for large schema outputs
      },
      (error, stdout, stderr) => {
        // Always clean up temp files
        cleanupTempFiles(tempFiles);

        if (error) {
          const out = stdout?.trim();
          if (out) {
            promiseResolve(truncateOutput(out));
            return;
          }

          const errMsg = stderr?.trim() || error.message || 'Command failed';

          if (error.killed) {
            promiseResolve(
              JSON.stringify({
                ok: false,
                error: {
                  code: 'CLI_TIMEOUT',
                  message: `Command timed out after ${TIMEOUT_MS / 1000}s: "${trimmed}"`,
                },
              })
            );
            return;
          }

          promiseResolve(
            JSON.stringify({
              ok: false,
              error: {
                code: 'CLI_ERROR',
                message: errMsg,
              },
            })
          );
          return;
        }

        const result =
          stdout?.trim() ||
          '{"ok": true, "data": {"message": "Command executed successfully (no output)"}}';
        promiseResolve(truncateOutput(result));
      }
    );
  });
}

/**
 * Scan CLI args for --file, --ast, --filters flags.
 * If the next arg looks like inline JSON (starts with { or [),
 * write it to a temp file and replace the arg with the file path.
 *
 * This lets the LLM pass JSON inline:
 *   quill report create --dashboard "Name" --file '{"name":"report","baseSql":"SELECT..."}'
 * and the backend transparently writes it to /tmp/quill-agent-xxx/data.json
 */
function materializeInlineJson(cliArgs: string[]): string[] {
  const tempFiles: string[] = [];

  for (let i = 0; i < cliArgs.length; i++) {
    if (FILE_FLAGS.includes(cliArgs[i]) && i + 1 < cliArgs.length) {
      const val = cliArgs[i + 1];
      if (val.startsWith('{') || val.startsWith('[')) {
        try {
          // Validate it's actual JSON before writing
          JSON.parse(val);
          const tmpDir = mkdtempSync(join(tmpdir(), 'quill-agent-'));
          const tmpPath = join(tmpDir, 'data.json');
          writeFileSync(tmpPath, val, 'utf-8');
          tempFiles.push(tmpPath, tmpDir);
          cliArgs[i + 1] = tmpPath;
        } catch {
          // Not valid JSON -- leave as-is, CLI will handle the error
        }
      }
    }
  }

  return tempFiles;
}

/**
 * Clean up temp files and directories created by materializeInlineJson.
 */
function cleanupTempFiles(paths: string[]): void {
  // Delete in reverse order (files first, then dirs)
  for (let i = paths.length - 1; i >= 0; i--) {
    try {
      if (paths[i].endsWith('.json')) {
        unlinkSync(paths[i]);
      } else {
        rmdirSync(paths[i]);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Smart truncation: fit as many items as possible within 12KB.
 * Small items (reports: ~120 bytes each) can fit ~100 items.
 * Large items get fewer. This is adaptive, not a fixed count.
 */
const MAX_OUTPUT_CHARS = 12288; // 12KB

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  try {
    const parsed = JSON.parse(output);
    if (parsed.ok && parsed.data && Array.isArray(parsed.data.items)) {
      const allItems = parsed.data.items;
      const total = parsed.data.total || allItems.length;

      // Dynamically find how many items fit within the budget
      let fitCount = allItems.length;
      for (let n = allItems.length; n > 0; n--) {
        parsed.data.items = allItems.slice(0, n);
        parsed.data._truncated = `Showing ${n} of ${total} items. Use --limit/--offset to paginate.`;
        if (JSON.stringify(parsed).length <= MAX_OUTPUT_CHARS) {
          fitCount = n;
          break;
        }
      }

      if (fitCount < allItems.length) {
        parsed.data.items = allItems.slice(0, fitCount);
        parsed.data._truncated = `Showing ${fitCount} of ${total} items. Use --limit/--offset to paginate.`;
      } else {
        delete parsed.data._truncated;
      }
      return JSON.stringify(parsed);
    }
  } catch {
    // Not valid JSON, fall through to raw truncation
  }

  return (
    output.slice(0, MAX_OUTPUT_CHARS) +
    '\n... (output truncated at 12KB. Use --limit/--offset to paginate.)'
  );
}

/**
 * Parse a command string into an array of arguments,
 * respecting quoted strings (single and double quotes).
 *
 * "quill dashboard show \"My Dashboard\"" -> ["quill", "dashboard", "show", "My Dashboard"]
 */
function parseCommand(cmd: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (const char of cmd) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}
