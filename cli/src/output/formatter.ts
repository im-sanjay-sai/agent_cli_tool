import chalk from 'chalk';
import { CliError, ErrorResponse, fromUnknown } from './errors.js';
import { SuccessResponse } from './success.js';
import { getGlobalOptions } from '../core/config.js';

export type OutputResponse = SuccessResponse | ErrorResponse;

/**
 * Format and output response to stdout
 */
export function output(response: OutputResponse): void {
  const opts = getGlobalOptions();
  const jsonString = formatJson(response, opts.pretty);
  console.log(jsonString);
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
 * Output success response
 */
export function outputSuccess<T>(response: SuccessResponse<T>): void {
  output(response);
}

/**
 * Output error response
 */
export function outputError(error: CliError | Error | unknown): void {
  const cliError = error instanceof CliError ? error : fromUnknown(error);
  output(cliError.toResponse());
  
  // Set exit code for errors
  process.exitCode = 1;
}

/**
 * Log verbose message to stderr (only if --verbose is set)
 */
export function verbose(message: string, data?: unknown): void {
  const opts = getGlobalOptions();
  if (opts.verbose) {
    const timestamp = new Date().toISOString();
    console.error(chalk.dim(`[${timestamp}] ${message}`));
    if (data !== undefined) {
      console.error(chalk.dim(JSON.stringify(data, null, 2)));
    }
  }
}

/**
 * Log warning to stderr
 */
export function warn(message: string): void {
  console.error(chalk.yellow(`Warning: ${message}`));
}

/**
 * Log info to stderr (for progress updates that shouldn't pollute JSON output)
 */
export function info(message: string): void {
  const opts = getGlobalOptions();
  // Only show info messages when not in pure JSON mode or when verbose
  if (opts.verbose || opts.pretty) {
    console.error(chalk.blue(`Info: ${message}`));
  }
}

/**
 * Pretty print for human-readable output
 */
export function prettyPrint(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return formatTable(data);
  }
  
  if (typeof data === 'object' && data !== null) {
    return formatObject(data as Record<string, unknown>);
  }
  
  return String(data);
}

/**
 * Format array as table
 */
function formatTable(items: unknown[]): string {
  if (items.length === 0) {
    return chalk.dim('(empty)');
  }
  
  const first = items[0];
  if (typeof first !== 'object' || first === null) {
    return items.map(item => `  - ${String(item)}`).join('\n');
  }
  
  // Get all keys
  const keys = [...new Set(items.flatMap(item => Object.keys(item as object)))];
  
  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = key.length;
    for (const item of items) {
      const value = String((item as Record<string, unknown>)[key] ?? '');
      widths[key] = Math.max(widths[key], value.length);
    }
  }
  
  // Build header
  const header = keys.map(key => key.padEnd(widths[key])).join('  ');
  const separator = keys.map(key => '-'.repeat(widths[key])).join('  ');
  
  // Build rows
  const rows = items.map(item => {
    return keys.map(key => {
      const value = String((item as Record<string, unknown>)[key] ?? '');
      return value.padEnd(widths[key]);
    }).join('  ');
  });
  
  return [
    chalk.bold(header),
    chalk.dim(separator),
    ...rows,
  ].join('\n');
}

/**
 * Format object for pretty output
 */
function formatObject(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${chalk.bold(key)}: ${chalk.dim('null')}`);
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        lines.push(`${prefix}${chalk.bold(key)}:`);
        if (value.length === 0) {
          lines.push(`${prefix}  ${chalk.dim('(empty)')}`);
        } else {
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              lines.push(`${prefix}  -`);
              lines.push(formatObject(item as Record<string, unknown>, indent + 2));
            } else {
              lines.push(`${prefix}  - ${String(item)}`);
            }
          }
        }
      } else {
        lines.push(`${prefix}${chalk.bold(key)}:`);
        lines.push(formatObject(value as Record<string, unknown>, indent + 1));
      }
    } else {
      lines.push(`${prefix}${chalk.bold(key)}: ${String(value)}`);
    }
  }
  
  return lines.join('\n');
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
