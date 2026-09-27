import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Passport's OAuth2 strategy calls Express-style `res.setHeader()` / `res.end()`
 * during the redirect step. Fastify's reply object doesn't have these.
 * Call this before `super.canActivate()` in any OAuth guard.
 *
 * On the START route, passport calls redirect() → setHeader + end().
 * `reply.hijack()` tells Fastify we handle the response ourselves so the
 * void controller handler doesn't cause a "double send".
 */
export function shimFastifyReplyForPassport(reply: FastifyReply): void {
  const r = reply as unknown as Record<string, unknown>;
  if (typeof r.setHeader !== 'function') {
    r.setHeader = (key: string, value: string) => {
      reply.raw.setHeader(key, value);
    };
  }
  if (typeof r.end !== 'function') {
    r.end = () => {
      reply.hijack();
      reply.raw.end();
    };
  }
}

const STATE_MAX_AGE_SECONDS = 600; // 10 minutes

/**
 * Generate a random OAuth state nonce and persist it in an httpOnly cookie.
 * Returns the nonce so the guard can pass it to passport via `getAuthenticateOptions`.
 *
 * Sets the cookie directly on `reply.raw` because the start-route shim uses
 * `reply.hijack()` which skips Fastify's own header serialisation (including
 * cookies registered via `reply.setCookie()`).
 */
export function generateOAuthState(
  reply: FastifyReply,
  cookieName: string,
  isProduction: boolean,
): string {
  const state = crypto.randomBytes(32).toString('hex');

  const parts = [
    `${cookieName}=${state}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${STATE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  reply.raw.setHeader('Set-Cookie', parts.join('; '));

  return state;
}

/**
 * Verify that the `state` query param from the OAuth callback matches the cookie
 * we set before the redirect. Clears the cookie afterwards.
 */
export function verifyOAuthState(
  request: FastifyRequest,
  reply: FastifyReply,
  cookieName: string,
): void {
  const queryState = (request.query as Record<string, string>)?.state;
  const cookieState = request.cookies?.[cookieName];
  reply.clearCookie(cookieName, { path: '/' });

  if (!queryState || !cookieState || queryState !== cookieState) {
    throw new UnauthorizedException('Invalid OAuth state parameter');
  }
}

/**
 * Returns true when the request looks like an OAuth callback (has a `code` query param).
 */
export function isOAuthCallback(request: FastifyRequest): boolean {
  return !!(request.query as Record<string, string>)?.code;
}
