import { execFile } from 'child_process';
import { resolve } from 'path';

const TIMEOUT_MS = 30_000;

// Run CLI from the backend root so it finds .quill/config.json
const BACKEND_ROOT = resolve(__dirname, '..');

/**
 * Safely execute a Quill CLI command.
 *
 * Uses execFile (not exec/execSync) to:
 *  - Avoid shell injection (no shell is spawned)
 *  - Not block the Node.js event loop
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

  return new Promise((resolve) => {
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
        },
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer for large schema outputs
      },
      (error, stdout, stderr) => {
        if (error) {
          // If there's stdout, the CLI likely returned a structured JSON error
          const out = stdout?.trim();
          if (out) {
            resolve(out);
            return;
          }

          const errMsg = stderr?.trim() || error.message || 'Command failed';

          // Distinguish timeout from other errors
          if (error.killed) {
            resolve(
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

          resolve(
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
        resolve(result);
      }
    );
  });
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
