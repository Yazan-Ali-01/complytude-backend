export const REDACTED = '[REDACTED]';

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
]);

/**
 * Pino fast-redact paths: sensitive keys at the top level of a log object and one level down
 * (e.g. `{ dto: { password } }`). Requests are logged through the `req` serializer, which never
 * emits headers or bodies; deeper values are covered by scrubLogValue in the logMethod hook.
 */
const REDACT_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'api_key',
  'apiKey',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
] as const;

export const PINO_REDACT_PATHS: ReadonlyArray<string> = [
  ...REDACT_KEYS,
  ...REDACT_KEYS.map((key) => `*.${key}`),
];

/**
 * Recursively sanitizes any value, replacing sensitive keys with REDACTED.
 * Key matching is case-insensitive. Handles nested objects and arrays.
 */
export function sanitizeObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject) as unknown as T;
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : sanitizeObject(val);
    }
    return result as T;
  }

  return value;
}
