import { databaseEnvSchema } from '@lib/database';
import { loggerEnvSchema } from '@lib/logger';
import { redisEnvSchema } from '@lib/redis';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().required(),
  ENTITLEMENT_STRICT_THRESHOLD_PERCENT: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(5),
  ENTITLEMENT_SUBSCRIPTION_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(10)
    .max(3600)
    .default(60),
  ENTITLEMENT_FEATURE_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(7200)
    .default(300),
  ENTITLEMENT_CACHE_CLEANUP_INTERVAL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(300),

  // Database
  ...databaseEnvSchema,

  // JWT
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_IDENTITY_SECRET: Joi.string().required(),
  JWT_IDENTITY_REFRESH_SECRET: Joi.string().required(),
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

  // Email (Resend)
  EMAIL_PROVIDER: Joi.string()
    .valid('resend', 'ses', 'sendgrid')
    .default('resend'),
  EMAIL_API_KEY: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().default('noreply@complytude.com'),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  /** When true, email methods return without calling SES (local/tests). */
  EMAIL_SKIP_SEND: Joi.string().valid('true', 'false').default('false'),

  // S3/MinIO Storage
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

  // Logging
  ...loggerEnvSchema,

  // Redis Configuration
  ...redisEnvSchema,

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_PUBLISHABLE_KEY: Joi.string().required(),
  STRIPE_CATALOG_SYNC_ENABLED: Joi.boolean().default(false),
  STRIPE_TAX_ENABLED: Joi.boolean().default(false),

  // Billing Scheduler
  BILLING_SCHEDULE_ENABLED: Joi.boolean().default(false),

  // Bull Board — when set, /admin/queues requires Authorization: Bearer <secret>
  // In production, this MUST be set. In development, omit to allow unauthenticated access.
  BULL_BOARD_ADMIN_SECRET: Joi.string().optional().allow(''),

  // AWS SES (verification, password reset, billing notices)
  AWS_REGION: Joi.string().default('eu-central-1'),
  FROM_EMAIL: Joi.string().email().required(),
  FROM_NAME: Joi.string().default('Complytude Billing'),
  SUPPORT_EMAIL: Joi.string().email().required(),

  // Gotenberg (DOCX → PDF conversion)
  GOTENBERG_URL: Joi.string().uri().default('http://localhost:3100'),

  // Google OAuth2 SSO (optional — omit or leave empty to disable)
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional().default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional().default(''),
  GOOGLE_CALLBACK_URL: Joi.string().allow('').optional().default(''),

  // Microsoft OAuth2 SSO (optional — omit or leave empty to disable)
  MICROSOFT_CLIENT_ID: Joi.string().allow('').optional().default(''),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow('').optional().default(''),
  MICROSOFT_CALLBACK_URL: Joi.string().allow('').optional().default(''),
  MICROSOFT_TENANT_ID: Joi.string().allow('').optional().default('common'),

  // Where the API redirects the browser after OAuth (relative to FRONTEND_URL)
  SSO_FRONTEND_SUCCESS_PATH: Joi.string().default('/auth/callback'),
  SSO_FRONTEND_ERROR_PATH: Joi.string().default('/auth/error'),
});
