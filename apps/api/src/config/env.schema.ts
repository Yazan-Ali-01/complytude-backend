import {
  databaseEnvSchema,
  databasePlatformEnvSchema,
  secretEnv,
} from '@lib/database';
import { loggerEnvSchema } from '@lib/logger';
import { redisEnvSchema } from '@lib/redis';
import * as Joi from 'joi';

const JWT_SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_IDENTITY_SECRET',
  'JWT_IDENTITY_REFRESH_SECRET',
] as const;

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  // Echo verification/reset tokens in the signup and forgot-password responses, for tests and
  // local development only; never in production
  AUTH_ECHO_TOKENS: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(false).messages({
        'any.only':
          'AUTH_ECHO_TOKENS must not be true when NODE_ENV=production',
      }),
    }),
  // Refuse new passwords found in data breaches (Have I Been Pwned range API, k-anonymity)
  PASSWORD_BREACH_CHECK_ENABLED: Joi.boolean().default(true),
  // Dev-only demo routes (MockModule, RagMockModule); see app.module.ts
  ENABLE_MOCK_ROUTES: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(false).messages({
        'any.only':
          'ENABLE_MOCK_ROUTES must not be true when NODE_ENV=production',
      }),
    }),
  PORT: Joi.number().default(3000),
  // Redis-backed request limits and login lockout (off only in tests that log in many times)
  RATE_LIMIT_ENABLED: Joi.boolean()
    .default(true)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(true).messages({
        'any.only':
          'RATE_LIMIT_ENABLED must not be false when NODE_ENV=production',
      }),
    }),
  // Proxies whose X-Forwarded-For entries are trusted for the client IP: 1 behind the ALB
  TRUST_PROXY_HOPS: Joi.number()
    .integer()
    .min(0)
    .max(5)
    .default(0)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.number().min(1).required().messages({
        'number.min':
          'TRUST_PROXY_HOPS must be at least 1 when NODE_ENV=production',
        'any.required': 'TRUST_PROXY_HOPS is required when NODE_ENV=production',
      }),
    }),
  API_PREFIX: Joi.string().default('api'),
  // Browser origins allowed to call the API (and to be sent back to by Stripe): comma-separated
  CORS_ORIGINS: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      const production =
        (helpers.state.ancestors[0] as Record<string, unknown>)?.NODE_ENV ===
        'production';
      const entries = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (entries.length === 0) {
        return helpers.message({
          custom: 'CORS_ORIGINS must list at least one origin',
        });
      }
      for (const entry of entries) {
        let protocol: string;
        try {
          protocol = new URL(entry).protocol;
        } catch {
          return helpers.message({
            custom: `CORS_ORIGINS entry "${entry}" is not an origin such as https://app.example.com`,
          });
        }
        if (protocol !== 'https:' && (production || protocol !== 'http:')) {
          return helpers.message({
            custom: production
              ? `CORS_ORIGINS entry "${entry}" must be https when NODE_ENV=production`
              : `CORS_ORIGINS entry "${entry}" must be an http(s) origin`,
          });
        }
      }
      return value;
    }),

  // Database
  ...databaseEnvSchema,
  ...databasePlatformEnvSchema,

  // JWT
  // Four distinct secrets (checked below), each at least 32 characters in production
  ...Object.fromEntries(
    JWT_SECRET_KEYS.map((key) => [key, secretEnv(key, { min: 32 })]),
  ),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_IDENTITY_EXPIRES_IN: Joi.string().default('10m'),
  EMAIL_VERIFICATION_EXPIRES_IN: Joi.string().default('1d'),

  // MaxMind GeoLite2-City database (the image downloads it at build time); empty = geo disabled
  MAXMIND_DB_PATH: Joi.string()
    .allow('')
    .optional()
    .default('./data/GeoLite2-City.mmdb'),

  // Session (Redis-backed)
  SESSION_MAX_TTL: Joi.string().default('14d'),
  SESSION_IDLE_TIMEOUT: Joi.string().default('72h'),
  SESSION_MAX_PER_USER: Joi.number().integer().min(1).max(20).default(5),
  SESSION_ACTIVITY_THROTTLE_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(120),

  // The web app: email links (verify, reset, invite, upgrade) and SSO redirects point here
  FRONTEND_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required()
      .messages({
        'any.required': 'FRONTEND_URL is required when NODE_ENV=production',
        'string.uriCustomScheme':
          'FRONTEND_URL must be an https URL when NODE_ENV=production',
      }),
    otherwise: Joi.string().uri().default('http://localhost:3000'),
  }),
  /** When true, email methods return without calling SES (local/tests). */
  EMAIL_SKIP_SEND: Joi.string().valid('true', 'false').default('false'),

  // S3 Storage
  S3_ENDPOINT: Joi.string().allow('').default(''),
  S3_REGION: Joi.string().default('eu-central-1'),
  S3_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_SECRET_KEY: Joi.string().allow('').default(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),

  // Storage Buckets
  COMPLYTUDE_FILES_BUCKET_NAME: Joi.string().default('complytude-files'),
  TEMPLATES_BUCKET_NAME: Joi.string().default('complytude-templates'),
  QUARANTINE_BUCKET_NAME: Joi.string().default('complytude-quarantine'),

  // File Upload Limits
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB
  TEMPLATE_MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB
  SIGNED_URL_EXPIRES_IN: Joi.number().default(900), // 15 minutes
  // Most PDF pages an upload may have (OCR bills per page); keep equal to worker-ingestion's
  DOCUMENT_MAX_PAGES: Joi.number().integer().min(1).default(50),

  // A ruleset version is activated only once its legal review is recorded (D-9): always in
  // production; elsewhere drafts may be activated (each result then says the rules are unreviewed)
  RULESETS_REQUIRE_REVIEW: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().valid(true).default(true).messages({
      'any.only':
        'RULESETS_REQUIRE_REVIEW must be true when NODE_ENV=production',
    }),
    otherwise: Joi.boolean().default(false),
  }),
  // Previews a tenant may request per day (UTC); each is a document conversion
  PREVIEW_DAILY_LIMIT: Joi.number().integer().min(1).default(50),

  // Logging
  ...loggerEnvSchema,

  // Redis Configuration
  ...redisEnvSchema,

  // Stripe. STRIPE_MODE says which account the keys belong to; staging runs NODE_ENV=production
  // with test keys, so the mode can't be derived from NODE_ENV
  STRIPE_MODE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('test', 'live').required().messages({
      'any.required':
        'STRIPE_MODE (test or live) is required when NODE_ENV=production',
    }),
    otherwise: Joi.string().valid('test', 'live').default('test'),
  }),
  STRIPE_SECRET_KEY: secretEnv('STRIPE_SECRET_KEY', { min: 20 }),
  STRIPE_WEBHOOK_SECRET: secretEnv('STRIPE_WEBHOOK_SECRET', { min: 20 }),
  STRIPE_PUBLISHABLE_KEY: Joi.string().required(),
  STRIPE_CATALOG_SYNC_ENABLED: Joi.boolean().default(false),
  STRIPE_TAX_ENABLED: Joi.boolean().default(false),

  // Billing Scheduler
  BILLING_SCHEDULE_ENABLED: Joi.boolean().default(false),

  // Bull Board (/admin/queues) listens on BULL_BOARD_PORT, never on the public API port.
  // Required in production. Without it the dashboard is open and bound to 127.0.0.1 (local dev).
  BULL_BOARD_ADMIN_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required().messages({
      'any.required':
        'BULL_BOARD_ADMIN_SECRET is required when NODE_ENV=production',
      'string.empty':
        'BULL_BOARD_ADMIN_SECRET is required when NODE_ENV=production',
      'string.min':
        'BULL_BOARD_ADMIN_SECRET must be at least 32 characters when NODE_ENV=production',
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  BULL_BOARD_PORT: Joi.number().port().default(3010),

  // AWS SES (verification, password reset, billing notices)
  AWS_REGION: Joi.string().default('eu-central-1'),
  FROM_EMAIL: Joi.string().email().required(),
  FROM_NAME: Joi.string().default('Complytude Billing'),
  SUPPORT_EMAIL: Joi.string().email().required(),
  // SES configuration set named on every send (delivery/bounce/complaint events); empty = none
  SES_CONFIGURATION_SET: Joi.string().allow('').default(''),

  // Google OAuth2 SSO (optional — omit or leave empty to disable)
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional().default(''),
  GOOGLE_CLIENT_SECRET: secretEnv('GOOGLE_CLIENT_SECRET', {
    min: 16,
    optional: true,
  }).default(''),
  GOOGLE_CALLBACK_URL: Joi.string().allow('').optional().default(''),

  // Microsoft OAuth2 SSO (optional — omit or leave empty to disable)
  MICROSOFT_CLIENT_ID: Joi.string().allow('').optional().default(''),
  MICROSOFT_CLIENT_SECRET: secretEnv('MICROSOFT_CLIENT_SECRET', {
    min: 16,
    optional: true,
  }).default(''),
  MICROSOFT_CALLBACK_URL: Joi.string().allow('').optional().default(''),
  MICROSOFT_TENANT_ID: Joi.string().allow('').optional().default('common'),

  // Where the API redirects the browser after OAuth (relative to FRONTEND_URL)
  SSO_FRONTEND_SUCCESS_PATH: Joi.string().default('/auth/callback'),
  SSO_FRONTEND_ERROR_PATH: Joi.string().default('/auth/error'),
}).custom((env: Record<string, unknown>, helpers) => {
  const secrets = JWT_SECRET_KEYS.map((key) => env[key]);
  if (new Set(secrets).size !== secrets.length) {
    return helpers.message({
      custom: `${JWT_SECRET_KEYS.join(', ')} must all be different`,
    });
  }
  // Test keys on the live deployment (or the reverse) would bill nobody, or bill real cards
  const mode = env.STRIPE_MODE as string | undefined;
  const mismatched = [
    ['STRIPE_SECRET_KEY', ['sk_', 'rk_']],
    ['STRIPE_PUBLISHABLE_KEY', ['pk_']],
  ].filter(([key, prefixes]) => {
    const value = env[key as string];
    return (
      mode &&
      typeof value === 'string' &&
      value.length > 0 &&
      !(prefixes as string[]).some((prefix) =>
        value.startsWith(`${prefix}${mode}_`),
      )
    );
  });
  return mismatched.length === 0
    ? env
    : helpers.message({
        custom: `${mismatched.map(([key]) => key).join(', ')} must be ${mode}-mode keys (STRIPE_MODE=${mode})`,
      });
});
