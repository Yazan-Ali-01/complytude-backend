import { REDACTED, SENSITIVE_KEYS } from './logger.redaction';

const EMAIL =
  /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** Values of query parameters that grant access (invitation and reset tokens, OAuth code/state). */
const SECRET_QUERY =
  /([?&](?:token|code|state|secret|password|signature|key|access_token|refresh_token)=)[^&\s#"']+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi;

const MAX_DEPTH = 5;

/**
 * Removes what must never reach the log store from a string: access-granting tokens (JWTs,
 * bearer tokens, token/code/state query values) become [REDACTED], and email addresses are
 * masked to their first character and domain (`a***@corp.com`), which still helps debugging.
 */
export function scrubLogText(text: string): string {
  return text
    .replace(JWT, REDACTED)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(SECRET_QUERY, `$1${REDACTED}`)
    .replace(EMAIL, '$1***@$2');
}

/** scrubLogText on every string inside a log argument; sensitive keys are replaced outright. */
export function scrubLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubLogText(value);
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) {
    return value;
  }
  if (value instanceof Error) {
    // A plain copy: pino's error serializer reads message and stack from it
    return {
      type: value.name,
      message: scrubLogText(value.message),
      stack: value.stack ? scrubLogText(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubLogValue(item, depth + 1));
  }
  // Only plain data: requests, responses and other instances go through their serializers
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? REDACTED
      : scrubLogValue(item, depth + 1);
  }
  return result;
}
