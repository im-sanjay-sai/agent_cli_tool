import { randomUUID } from 'crypto';

/**
 * Generate a unique ID with a prefix
 */
export function generateId(prefix: 'dash' | 'rep' | 'vt'): string {
  const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${uuid}`;
}
