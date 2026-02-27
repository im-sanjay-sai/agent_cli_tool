import chalk from 'chalk';
import { CliError, ErrorResponse, fromUnknown } from './errors.js';
import { SuccessResponse } from './success.js';
import { getGlobalOptions } from '../core/config.js';

export type OutputResponse = SuccessResponse | ErrorResponse;

/**
 * A function that formats a response as a human-readable string.
 * When provided and --raw is not set, output() will use this instead of JSON.
 */
export type HumanFormatter = (response: OutputResponse) => string;

/**
 * Format and output response to stdout.
 * If a humanFormatter is provided and --raw is not set, outputs human-readable text.
 * Otherwise, outputs JSON.
 */
export function output(response: OutputResponse, humanFormatter?: HumanFormatter): void {
  const opts = getGlobalOptions();

  if (opts.raw || !humanFormatter) {
    const jsonString = formatJson(response, opts.pretty);
    console.log(jsonString);
  } else {
    console.log(humanFormatter(response));
  }
}

/**
 * Format JSON with optional pretty printing
 */
export function formatJson(data: unknown, pretty?: boolean): string {
  if (pretty) {
    return JSON.stringify(data, null, 2);
  }
  return JSON.stringify(data);
}

/**
 * Format error for human-readable output
 */
function formatErrorHuman(cliError: CliError): string {
  const lines: string[] = [];
  lines.push(chalk.red(`Error: ${cliError.message}`));

  if (cliError.details) {
    const { issues, originalError, ...rest } = cliError.details;

    // Zod validation issues (array of strings)
    if (Array.isArray(issues)) {
      lines.push('');
      lines.push(chalk.dim('Details:'));
      for (const issue of issues) {
        lines.push(chalk.dim(`  - ${issue}`));
      }
    }

    // Original error message (e.g., ENOENT path, network error)
    if (typeof originalError === 'string') {
      lines.push('');
      lines.push(chalk.dim(`  ${originalError}`));
    }

    // Other details (e.g., status code, resource info)
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && typeof value !== 'object') {
        lines.push(chalk.dim(`  ${key}: ${value}`));
      }
    }
  }

  if (cliError.suggestions && cliError.suggestions.length > 0) {
    lines.push('');
    lines.push(chalk.yellow('Suggestions:'));
    for (const suggestion of cliError.suggestions) {
      lines.push(chalk.yellow(`  - ${suggestion}`));
    }
  }

  return lines.join('\n');
}

/**
 * Output error response and set exit code.
 * Uses human-readable format by default unless --raw is set.
 */
export function outputError(error: CliError | Error | unknown): void {
  const cliError = error instanceof CliError ? error : fromUnknown(error);
  const opts = getGlobalOptions();

  if (opts.raw) {
    output(cliError.toResponse());
  } else {
    console.error(formatErrorHuman(cliError));
  }
  process.exitCode = 1;
}

/**
 * Log verbose message to stderr (only if --verbose is set)
 */
export function verbose(message: string, data?: unknown): void {
  const opts = getGlobalOptions();
  if (opts.verbose) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${message}`);
    if (data !== undefined) {
      console.error(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Wrap async command handler with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      outputError(error);
    }
  };
}
