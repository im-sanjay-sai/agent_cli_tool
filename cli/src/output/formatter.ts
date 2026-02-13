import { CliError, ErrorResponse, fromUnknown } from './errors.js';
import { SuccessResponse } from './success.js';
import { getGlobalOptions } from '../core/config.js';

export type OutputResponse = SuccessResponse | ErrorResponse;

/**
 * Format and output response to stdout (always JSON)
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
 * Output error response and set exit code
 */
export function outputError(error: CliError | Error | unknown): void {
  const cliError = error instanceof CliError ? error : fromUnknown(error);
  output(cliError.toResponse());
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
