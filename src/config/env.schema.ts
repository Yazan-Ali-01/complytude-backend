import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Database
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_APP_USER: Joi.string().required(),
  DB_APP_PASSWORD: Joi.string().required(),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_TEMP_AUTH_SECRET: Joi.string().required(),
  JWT_REFRESH_HASH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('14d'),
  JWT_TEMP_AUTH_EXPIRES_IN: Joi.string().default('10m'),
  EMAIL_VERIFICATION_EXPIRES_IN: Joi.string().default('1d'),

  // S3/MinIO Storage
  S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().default('minioadmin'),
  S3_SECRET_KEY: Joi.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  // Storage Buckets
  COMPLYTUDE_FILES_BUCKET_NAME: Joi.string().default('complytude-files'),
  TEMPLATES_BUCKET_NAME: Joi.string().default('complytude-templates'),

  // File Upload Limits
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB
  TEMPLATE_MAX_FILE_SIZE: Joi.number().default(5242880), // 5MB
  SIGNED_URL_EXPIRES_IN: Joi.number().default(900), // 15 minutes
});
