import { randomUUID } from 'crypto';
import { invalidInput } from '../output/errors.js';

/**
 * Generate a unique ID with a prefix
 */
export function generateId(prefix: 'dash' | 'rep' | 'vt'): string {
  const uuid = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${uuid}`;
}

/**
 * Validate that a string is a valid MongoDB ObjectId (24 hex characters).
 * Use this before API calls to catch invalid IDs early instead of
 * getting raw MongoDB "Cast to ObjectId failed" errors.
 */
const MONGO_OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export function isValidObjectId(id: string): boolean {
  return MONGO_OBJECT_ID_REGEX.test(id);
}

/**
 * Throw INVALID_INPUT if the ID is not a valid ObjectId.
 * Import and call at the top of any command action that takes an <id> argument.
 */
export function requireValidId(id: string, resourceType: string): void {
  if (!isValidObjectId(id)) {
    throw invalidInput(
      `Invalid ${resourceType} ID: "${id}". Expected a 24-character hex string (MongoDB ObjectId).`,
      { id, resourceType }
    );
  }
}
