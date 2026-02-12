import { execFile } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { toolToCommand, toolsRequiringFile } from "./tools";

export interface ExecutionResult {
  success: boolean;
  output: string;
  command: string;
  error?: string;
}

/**
 * Write JSON data to a temp file and return its path.
 */
async function writeTempFile(data: unknown): Promise<string> {
  const id = randomBytes(8).toString("hex");
  const tmpPath = join(tmpdir(), `quill-agent-${id}.json`);
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  return tmpPath;
}

/**
 * Delete a temp file silently.
 */
async function cleanupTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore
  }
}

/**
 * Handle the special case of dashboard setup with inline reports.
 * Writes each report to a temp dir and passes the dir path.
 */
async function handleDashboardSetup(
  args: Record<string, unknown>
): Promise<{ cliArgs: string[]; tempFiles: string[] }> {
  const cliArgs = ["dashboard", "setup", "--name", args.name as string];
  const tempFiles: string[] = [];

  if (args.reports && Array.isArray(args.reports) && args.reports.length > 0) {
    const id = randomBytes(8).toString("hex");
    const tmpDir = join(tmpdir(), `quill-agent-reports-${id}`);
    await mkdir(tmpDir, { recursive: true });
    tempFiles.push(tmpDir);

    for (let i = 0; i < args.reports.length; i++) {
      const reportPath = join(tmpDir, `report-${i}.json`);
      await writeFile(reportPath, JSON.stringify(args.reports[i], null, 2), "utf-8");
      tempFiles.push(reportPath);
    }

    cliArgs.push("--reports", tmpDir);
  }

  if (args.filters) {
    const filtersPath = await writeTempFile(args.filters);
    tempFiles.push(filtersPath);
    cliArgs.push("--filters", filtersPath);
  }

  return { cliArgs, tempFiles };
}

/**
 * Execute a tool call by spawning the Quill CLI.
 */
export async function executeTool(
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<ExecutionResult> {
  const commandBuilder = toolToCommand[toolName];
  if (!commandBuilder) {
    return {
      success: false,
      output: JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: `Unknown tool: ${toolName}` } }),
      command: `quill (unknown: ${toolName})`,
    };
  }

  let cliArgs: string[];
  const tempFiles: string[] = [];

  try {
    // Special handling for dashboard setup (needs temp dir for reports)
    if (toolName === "quill_dashboard_setup") {
      const result = await handleDashboardSetup(toolArgs);
      cliArgs = result.cliArgs;
      tempFiles.push(...result.tempFiles);
    } else {
      cliArgs = commandBuilder(toolArgs);

      // Check if this tool needs a --file flag with JSON data
      const fileHandler = toolsRequiringFile[toolName];
      if (fileHandler) {
        const fileInfo = fileHandler(toolArgs);
        if (fileInfo) {
          const tmpPath = await writeTempFile(fileInfo.data);
          tempFiles.push(tmpPath);
          cliArgs.push(fileInfo.flag, tmpPath);
        }
      }
    }

    const commandStr = `quill ${cliArgs.join(" ")}`;

    // DRY RUN: log the command and return without executing
    const DRY_RUN = process.env.DRY_RUN === "true";
    if (DRY_RUN) {
      console.log(`[dry-run] Would execute: ${commandStr}`);
      return {
        success: true,
        output: JSON.stringify({
          ok: true,
          data: { dryRun: true, command: commandStr, args: toolArgs },
        }),
        command: commandStr,
      };
    }

    const result = await runCli(cliArgs);

    return {
      success: result.exitCode === 0,
      output: result.stdout || result.stderr || "No output",
      command: commandStr,
      error: result.exitCode !== 0 ? result.stderr || undefined : undefined,
    };
  } finally {
    // Cleanup temp files
    for (const tmpFile of tempFiles) {
      await cleanupTempFile(tmpFile);
    }
  }
}

/**
 * Spawn the Quill CLI and capture output.
 */
function runCli(
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      "quill",
      [...args, "--json"],
      {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        const exitCode =
          (error as NodeJS.ErrnoException & { status?: number })?.status ?? 0;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
        });
      }
    );
  });
}
