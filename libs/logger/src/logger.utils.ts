import type { IncomingMessage } from 'node:http';

/**
 * Paths probed by automated vulnerability scanners. These are not real routes
 * we serve, so a 404 against any of them is internet noise — we demote the
 * resulting log line to `debug` so it doesn't pollute prod dashboards while
 * still being available locally and via `LOG_LEVEL=debug` if needed.
 *
 * Match is anchored loosely (substring/prefix) to catch path variants like
 * `/api/vendor/...`, `/.env.local`, `/index.php?...` etc.
 */
const SCANNER_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /\/vendor\//i, // PHP vendor probes (PHPUnit RCE, etc.)
  /\/\.env(\.|\/|$|\?)/i, // .env, .env.local, .env.production
  /\/\.git(\/|$|\?)/i, // .git/config, .git/HEAD
  /\/\.aws(\/|$|\?)/i, // AWS credentials probes
  /\/\.ssh(\/|$|\?)/i, // SSH key probes
  /\/wp-(login|admin|content|includes|config)/i, // WordPress probes
  /\/phpmyadmin/i, // phpMyAdmin probes
  /\/cgi-bin\//i, // CGI exploitation
  /\/owa\//i, // Exchange / OWA probes
  /\/ecp\//i, // Exchange ECP probes
  /\/manager\/html/i, // Tomcat manager probes
  /\/server-status\b/i,
  /\/server-info\b/i,
  /\.(php|asp|aspx|jsp|cgi)(\?|$)/i, // Any PHP/ASP/JSP route on a Node server
  /\/HNAP1\b/i, // D-Link router exploits
  /\/boaform\//i, // Common router exploits
];

export function isScannerPath(url: string | undefined): boolean {
  if (!url) return false;
  return SCANNER_PATH_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Returns the client IP for an inbound request, preferring the leftmost
 * address in `X-Forwarded-For` (set by our ALB) and falling back to the raw
 * socket remote address. Returns `undefined` when no IP can be determined.
 *
 * NOTE: trust-proxy must be enabled on the HTTP adapter for the `X-Forwarded-For`
 * header to be authoritative.
 */
export function getClientIp(
  req: IncomingMessage & { ip?: string },
): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(',')[0]?.trim();
    if (first) return first;
  }

  if (req.ip) return req.ip;

  return req.socket?.remoteAddress ?? undefined;
}

/**
 * Expands an IPv6 address into 8 fully-specified hex groups, returning `null`
 * if the input is not a valid IPv6 address. Handles `::` zero-compression
 * and embedded IPv4-mapped tails (`::ffff:1.2.3.4`).
 */
function expandIPv6(addr: string): string[] | null {
  const cleaned = addr.split('%')[0] ?? '';
  if (!cleaned.includes(':')) return null;

  const doubleCount = (cleaned.match(/::/g) ?? []).length;
  if (doubleCount > 1) return null;

  const [head, tail = ''] = cleaned.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];

  const hexRe = /^[0-9a-f]{1,4}$/i;
  if (![...left, ...right].every((g) => hexRe.test(g))) return null;

  const total = left.length + right.length;
  if (total > 8) return null;
  if (doubleCount === 0 && total !== 8) return null;

  const middle = Array<string>(Math.max(0, 8 - total)).fill('0');
  return [...left, ...middle, ...right];
}

/**
 * Truncates an IP for privacy-preserving logging:
 *   - IPv4: zeroes the last octet (`203.0.113.42` → `203.0.113.0`)
 *   - IPv6: keeps the first 64 bits, zeroes the rest (`<g1>:<g2>:<g3>:<g4>::/64`)
 *   - Unknown formats: returns `[REDACTED]`
 *
 * Treats IPv4-mapped IPv6 (`::ffff:1.2.3.4`) as IPv4. Strips zone IDs.
 */
export function truncateIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;

  const cleaned = ip.split('%')[0]?.trim();
  if (!cleaned) return undefined;

  const v4Mapped = cleaned.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  );
  const v4 = v4Mapped ? v4Mapped[1] : cleaned;

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4)) {
    const parts = v4.split('.');
    if (parts.every((p) => Number(p) >= 0 && Number(p) <= 255)) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return '[REDACTED]';
  }

  if (cleaned.includes(':')) {
    const groups = expandIPv6(cleaned);
    if (!groups) return '[REDACTED]';
    return `${groups.slice(0, 4).join(':')}::/64`;
  }

  return '[REDACTED]';
}
