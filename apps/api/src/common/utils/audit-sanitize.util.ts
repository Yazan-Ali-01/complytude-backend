const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'creditcard',
  'credit_card',
  'ssn',
  'social_security',
  'api_key',
  'apikey',
  'private_key',
  'privatekey',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'session',
  'cookie',
]);

const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 500;
const REDACTED = '[REDACTED]';
const TRUNCATED_SUFFIX = '...[TRUNCATED]';
const DEPTH_EXCEEDED = '[MAX_DEPTH_EXCEEDED]';

export function sanitizeBody(body: unknown, depth = 0): unknown {
  if (body === null || body === undefined) return body;
  if (depth >= MAX_DEPTH) return DEPTH_EXCEEDED;

  if (typeof body === 'string') {
    return body.length > MAX_STRING_LENGTH
      ? body.substring(0, MAX_STRING_LENGTH) + TRUNCATED_SUFFIX
      : body;
  }

  if (typeof body !== 'object') return body;

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED;
    } else {
      result[key] = sanitizeBody(value, depth + 1);
    }
  }
  return result;
}
