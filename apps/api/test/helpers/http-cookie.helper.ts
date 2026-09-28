/**
 * Build a single Cookie header value from Fastify `set-cookie` response headers, the way a
 * browser's cookie jar would: when the same cookie is set more than once (e.g. headers merged
 * from login and tenant-switch), the later value wins, and a cleared cookie (empty value,
 * `Max-Age=0` or an `Expires` in the past) is dropped instead of being sent empty.
 */
export function cookieHeaderFromSetCookie(
  headers: Record<string, string | string[] | undefined>,
): string {
  const sc = headers['set-cookie'];
  if (!sc) return '';
  const list = Array.isArray(sc) ? sc : [sc];

  const jar = new Map<string, string>();
  for (const line of list) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);

    const cleared =
      value === '' ||
      attributes.some((attr) => {
        const [key, attrValue = ''] = attr.split('=');
        const lower = key.toLowerCase();
        if (lower === 'max-age') return Number(attrValue) <= 0;
        if (lower === 'expires')
          return new Date(attrValue).getTime() < Date.now();
        return false;
      });

    jar.delete(name); // re-insert so the header keeps the latest order
    if (!cleared) jar.set(name, value);
  }

  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
