/**
 * Jest integration shim: `uuid` v13 is ESM-only; ts-jest loads CJS. Re-export v4 via node:crypto.
 */
import { randomUUID } from 'node:crypto';

export function v4(): string {
  return randomUUID();
}
