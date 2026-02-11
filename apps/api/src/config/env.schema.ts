import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().required(),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_NAME: Joi.string().required(),
  DB_APP_USER: Joi.string().required(),
  DB_APP_PASSWORD: Joi.string().required(),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),

  // Session Management
  SESSION_MAX_TTL: Joi.string().default('14d'), // Absolute session timeout
  SESSION_IDLE_TIMEOUT: Joi.string().default('72h'), // Idle timeout
  SESSION_MAX_PER_USER: Joi.number().default(5), // Max identity sessions per user
  SESSION_ACTIVITY_THROTTLE_SECONDS: Joi.number().default(120), // Activity update throttle (2 minutes)

  // JWT
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_IDENTITY_SECRET: Joi.string().required(),
  JWT_IDENTITY_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_HASH_SECRET: Joi.string().required(), // Deprecated - will be removed after session migration
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('14d'), // Deprecated - replaced by SESSION_MAX_TTL
  JWT_IDENTITY_EXPIRES_IN: Joi.string().default('15m'),
  JWT_IDENTITY_REFRESH_EXPIRES_IN: Joi.string().default('14d'), // Deprecated - replaced by SESSION_MAX_TTL
  EMAIL_VERIFICATION_EXPIRES_IN: Joi.string().default('1d'),

  // MaxMind GeoIP (Optional - geo lookup disabled if database file not found)
  // Note: License key only needed for downloading database, not for runtime usage
  MAXMIND_DB_PATH: Joi.string().default('./data/GeoLite2-City.mmdb'),

  // S3/MinIO Storage
  S3_ENDPOINT: Joi.string().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  // Storage Buckets
  COMPLYTUDE_FILES_BUCKET_NAME: Joi.string().default('complytude-files'),
  TEMPLATES_BUCKET_NAME: Joi.string().default('complytude-templates'),

  // File Upload Limits
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB
  TEMPLATE_MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB
  SIGNED_URL_EXPIRES_IN: Joi.number().default(900), // 15 minutes

  // Redis Configuration
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_TLS: Joi.boolean().default(false),
  REDIS_KEY_PREFIX: Joi.string().default('complytude:'),
});
