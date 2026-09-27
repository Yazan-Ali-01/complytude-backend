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
 * Pino fast-redact paths for HTTP request-level fields.
 * Covers headers and shallow/one-level-nested body fields.
 * For deeper nesting, use sanitizeObject in serializers.
 */
export const PINO_REDACT_PATHS: ReadonlyArray<string> = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'req.body.api_key',
  'req.body.apiKey',
  'req.body.access_token',
  'req.body.accessToken',
  'req.body.refresh_token',
  'req.body.refreshToken',
  'req.body.*.password',
  'req.body.*.token',
  'req.body.*.secret',
  'req.body.*.api_key',
  'req.body.*.apiKey',
  'req.body.*.access_token',
  'req.body.*.accessToken',
  'req.body.*.refresh_token',
  'req.body.*.refreshToken',
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
