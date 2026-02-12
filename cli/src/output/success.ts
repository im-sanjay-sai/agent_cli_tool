import { z } from 'zod';

// Success response schema
export const SuccessResponseSchema = z.object({
  ok: z.literal(true),
  data: z.any(),
  warnings: z.array(z.string()).default([]),
  meta: z.object({
    source: z.enum(['local', 'remote', 'cache']).optional(),
    timestamp: z.string().datetime(),
    env: z.string().optional(),
  }).optional(),
});

export type SuccessResponse<T = unknown> = {
  ok: true;
  data: T;
  warnings: string[];
  meta?: {
    source?: 'local' | 'remote' | 'cache';
    timestamp: string;
    env?: string;
  };
};

// Create success response
export function success<T>(
  data: T,
  options?: {
    warnings?: string[];
    source?: 'local' | 'remote' | 'cache';
    env?: string;
  }
): SuccessResponse<T> {
  return {
    ok: true,
    data,
    warnings: options?.warnings || [],
    meta: {
      source: options?.source,
      timestamp: new Date().toISOString(),
      env: options?.env,
    },
  };
}

// Create list success response
export function successList<T>(
  items: T[],
  options?: {
    total?: number;
    warnings?: string[];
    source?: 'local' | 'remote' | 'cache';
    env?: string;
  }
): SuccessResponse<{ items: T[]; total: number }> {
  return success(
    {
      items,
      total: options?.total ?? items.length,
    },
    {
      warnings: options?.warnings,
      source: options?.source,
      env: options?.env,
    }
  );
}

// Create created success response
export function successCreated<T>(
  item: T,
  options?: {
    warnings?: string[];
    source?: 'local' | 'remote' | 'cache';
    env?: string;
  }
): SuccessResponse<{ created: T }> {
  return success({ created: item }, options);
}

// Create updated success response
export function successUpdated<T>(
  item: T,
  options?: {
    warnings?: string[];
    source?: 'local' | 'remote' | 'cache';
    env?: string;
  }
): SuccessResponse<{ updated: T }> {
  return success({ updated: item }, options);
}

// Create deleted success response
export function successDeleted(
  id: string,
  resourceType: string,
  options?: {
    warnings?: string[];
    source?: 'local' | 'remote' | 'cache';
    env?: string;
  }
): SuccessResponse<{ deleted: { id: string; type: string } }> {
  return success({ deleted: { id, type: resourceType } }, options);
}
