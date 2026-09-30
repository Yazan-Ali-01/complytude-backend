/** What a limit counts requests by. `email` reads the request body's `email`. */
export type RateLimitKey = 'ip' | 'email' | 'tenant' | 'user';

export interface RateLimitRule {
  /** Distinguishes counters of different rules on the same key. */
  name: string;
  limit: number;
  windowSeconds: number;
  by: RateLimitKey;
}

/** Every route: generous, only there to stop floods. */
export const GLOBAL_RATE_LIMIT: RateLimitRule = {
  name: 'global',
  limit: 300,
  windowSeconds: 60,
  by: 'ip',
};

/** Unauthenticated auth routes: password guessing, email bombing, token guessing. */
export const AUTH_RATE_LIMITS = {
  login: [
    { name: 'login-ip', limit: 20, windowSeconds: 60, by: 'ip' },
    { name: 'login-email', limit: 10, windowSeconds: 600, by: 'email' },
  ],
  signup: [{ name: 'signup-ip', limit: 5, windowSeconds: 600, by: 'ip' }],
  sendsEmail: [
    { name: 'email-send-ip', limit: 10, windowSeconds: 600, by: 'ip' },
    { name: 'email-send-email', limit: 3, windowSeconds: 600, by: 'email' },
  ],
  tokenCheck: [
    { name: 'token-check-ip', limit: 20, windowSeconds: 600, by: 'ip' },
  ],
} as const satisfies Record<string, RateLimitRule[]>;

/** Routes that spend on OpenAI, Cohere, OCR or Gotenberg, per tenant. */
export const EXPENSIVE_RATE_LIMIT: RateLimitRule = {
  name: 'expensive-tenant',
  limit: 30,
  windowSeconds: 60,
  by: 'tenant',
};
