import { z } from 'zod';

// Error codes as specified in the plan
export const ErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  CONFLICT: 'CONFLICT',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  IO_ERROR: 'IO_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// Error response schema
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
    suggestions: z.array(z.string()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// CLI Error class
export class CliError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly suggestions?: string[];

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    suggestions?: string[]
  ) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
    this.suggestions = suggestions;
  }

  toResponse(): ErrorResponse {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        suggestions: this.suggestions,
      },
    };
  }
}

// Error factory functions
export function notFound(resource: string, id?: string): CliError {
  const message = id 
    ? `${resource} with id '${id}' not found`
    : `${resource} not found`;
  return new CliError(ErrorCode.NOT_FOUND, message, { resource, id }, [
    `Check if the ${resource.toLowerCase()} exists with 'quill ${resource.toLowerCase()} list'`,
    `Verify the ID is correct`,
  ]);
}

export function invalidInput(message: string, details?: Record<string, unknown>): CliError {
  return new CliError(ErrorCode.INVALID_INPUT, message, details, [
    'Check the input format and try again',
    'Use --help to see command usage',
  ]);
}

export function conflict(message: string, details?: Record<string, unknown>): CliError {
  return new CliError(ErrorCode.CONFLICT, message, details, [
    'Review the conflicting resources',
    'Use --force to override (if supported)',
  ]);
}

export function authRequired(message: string = 'Authentication required'): CliError {
  return new CliError(ErrorCode.AUTH_REQUIRED, message, undefined, [
    'Run `quill login` to authenticate',
    'Or set QUILL_API_TOKEN environment variable',
    'Or use --token flag',
  ]);
}

export function ioError(message: string, details?: Record<string, unknown>): CliError {
  return new CliError(ErrorCode.IO_ERROR, message, details, [
    'Check file permissions',
    'Verify the path exists',
  ]);
}

export function networkError(message: string, details?: Record<string, unknown>): CliError {
  return new CliError(ErrorCode.NETWORK_ERROR, message, details, [
    'Check your internet connection',
    'Verify the API endpoint is correct',
    'Run `quill login` to authenticate',
  ]);
}

/**
 * Map an API response error string to the correct CliError type.
 * The Quill API often returns errors with HTTP 200, so we can't rely
 * on status codes. Instead, parse the error message to determine the type.
 */
export function apiError(message: string): CliError {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('does not exist')) {
    return new CliError(ErrorCode.NOT_FOUND, message, undefined, [
      'Check that the resource exists',
      'Verify the name or ID is correct',
    ]);
  }
  if (lower.includes('not authorized') || lower.includes('not enabled') || lower.includes('unauthorized')) {
    return authRequired(message);
  }
  if (lower.includes('required') || lower.includes('invalid') || lower.includes('must be')) {
    return invalidInput(message);
  }
  return networkError(message);
}

export function validationError(message: string, details?: Record<string, unknown>): CliError {
  return new CliError(ErrorCode.VALIDATION_ERROR, message, details, [
    'Check the input data format',
    'Review the error details for specific issues',
  ]);
}

export function notInitialized(): CliError {
  return new CliError(
    ErrorCode.NOT_INITIALIZED,
    'Quill CLI is not initialized in this directory',
    undefined,
    ['Run `quill config init` to initialize']
  );
}

export function alreadyExists(resource: string, id: string): CliError {
  return new CliError(
    ErrorCode.ALREADY_EXISTS,
    `${resource} with id '${id}' already exists`,
    { resource, id },
    ['Use a different ID', 'Or delete the existing resource first']
  );
}

// Convert Zod errors to CliError
export function fromZodError(error: z.ZodError): CliError {
  const issues = error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  
  return new CliError(
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    { issues },
    ['Check the input data format', ...issues.slice(0, 3)]
  );
}

// Convert unknown errors
export function fromUnknown(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  
  if (error instanceof z.ZodError) {
    return fromZodError(error);
  }
  
  if (error instanceof Error) {
    // Check for common error types
    if (error.message.includes('ENOENT')) {
      return ioError('File or directory not found', { originalError: error.message });
    }
    if (error.message.includes('EACCES')) {
      return ioError('Permission denied', { originalError: error.message });
    }
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
      return networkError('Network request failed', { originalError: error.message });
    }
    
    return new CliError(ErrorCode.IO_ERROR, error.message);
  }
  
  return new CliError(ErrorCode.IO_ERROR, String(error));
}
