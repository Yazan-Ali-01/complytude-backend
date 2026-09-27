/**
 * Build a single Cookie header value from Fastify `set-cookie` response headers.
 */
export function cookieHeaderFromSetCookie(
  headers: Record<string, string | string[] | undefined>,
): string {
  const sc = headers['set-cookie'];
  if (!sc) return '';
  const list = Array.isArray(sc) ? sc : [sc];
  return list
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}
