import type { FastifyRequest } from 'fastify';

/**
 * Extract client IP address from HTTP request
 *
 * Handles various proxy scenarios following security best practices:
 * 1. X-Forwarded-For: Standard proxy header (most common)
 * 2. X-Real-IP: Alternative proxy header (Nginx, CloudFlare)
 * 3. request.ip: Direct connection (Fastify built-in)
 *
 * Security Considerations:
 * - X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
 * - Always use the FIRST IP (leftmost) as the client IP
 * - Trim whitespace to prevent injection attacks
 * - Provide fallback for localhost development
 *
 * Proxy Header Format:
 * X-Forwarded-For: client-ip, proxy1-ip, proxy2-ip
 *                  ^^^^^^^^^^ This is the real client IP
 *
 * Architecture Pattern:
 * Used by: Session creation, audit logging, security monitoring
 * Follows: OWASP security guidelines for proxy header handling
 *
 * @param request - Fastify request object
 * @param fallback - Default IP if extraction fails (default: '127.0.0.1')
 * @returns Client IP address
 *
 * @example
 * ```typescript
 * const clientIp = getClientIpAddress(request);
 * // Returns: '203.0.113.42'
 *
 * const clientIp = getClientIpAddress(request, 'unknown');
 * // Returns: '203.0.113.42' or 'unknown' if not found
 * ```
 */
export function getClientIpAddress(
  request: FastifyRequest,
  fallback: string = '127.0.0.1',
): string {
  // Priority 1: X-Forwarded-For header (standard proxy header)
  // Format: "client, proxy1, proxy2" - take first (leftmost) IP
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Handle both string and string array (Fastify typing)
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;

    // Extract first IP from comma-separated list and trim whitespace
    const clientIp = forwardedIp.split(',')[0]?.trim();

    if (clientIp && clientIp.length > 0) {
      return clientIp;
    }
  }

  // Priority 2: X-Real-IP header (Nginx, CloudFlare)
  const realIp = request.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    const trimmedIp = realIp.trim();
    if (trimmedIp.length > 0) {
      return trimmedIp;
    }
  }

  // Priority 3: Direct connection IP (Fastify built-in)
  if (request.ip && request.ip.length > 0) {
    return request.ip;
  }

  // Fallback: Development/testing scenario
  return fallback;
}
