import { databaseEnvSchema, secretEnv } from '@lib/database';
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
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().required(),
  ENTITLEMENT_STRICT_THRESHOLD_PERCENT: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(5),

  // Database
  ...databaseEnvSchema,

  // JWT
  // Four distinct secrets (checked below), each at least 32 characters in production
  ...Object.fromEntries(
    JWT_SECRET_KEYS.map((key) => [key, secretEnv(key, { min: 32 })]),
  ),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_IDENTITY_EXPIRES_IN: Joi.string().default('10m'),
  EMAIL_VERIFICATION_EXPIRES_IN: Joi.string().default('1d'),

  // MaxMind GeoIP (optional — empty = geo disabled)
  MAXMIND_LICENSE_KEY: Joi.string().allow('').optional().default(''),
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
  SESSION_STRICT_MODE: Joi.boolean().default(false),

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
  // Most PDF pages an upload may have (Textract bills per page); keep equal to worker-ingestion's
  TEXTRACT_MAX_PAGES: Joi.number().integer().min(1).default(50),

  // Logging
  ...loggerEnvSchema,

  // Redis Configuration
  ...redisEnvSchema,

  // Stripe
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

  // Gotenberg (DOCX → PDF conversion)
  GOTENBERG_URL: Joi.string().uri().default('http://localhost:3100'),

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
  return new Set(secrets).size === secrets.length
    ? env
    : helpers.message({
        custom: `${JWT_SECRET_KEYS.join(', ')} must all be different`,
      });
});
