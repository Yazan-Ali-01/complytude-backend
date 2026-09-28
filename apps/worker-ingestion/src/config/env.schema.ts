import { databaseEnvSchema, secretEnv } from '@lib/database';
import { embeddingEnvSchema } from '@lib/embedding';
import { loggerEnvSchema } from '@lib/logger';
import { redisEnvSchema } from '@lib/redis';
import { storageEnvSchema } from '@lib/storage';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Worker Ingestion Port
  WORKER_INGESTION_PORT: Joi.number().default(3002),

  // Queue / Processing configuration
  WORKER_INGESTION_CONCURRENCY: Joi.number().default(10),
  WORKER_INGESTION_MAX_RETRIES: Joi.number().default(3),
  WORKER_INGESTION_RETRY_DELAY: Joi.number().default(3000),
  WORKER_INGESTION_MAX_PROCESSING_TIME: Joi.number().default(180000),
  WORKER_INGESTION_BATCH_SIZE: Joi.number().default(500),

  // Resource Limits
  WORKER_INGESTION_MEMORY_LIMIT: Joi.string().default('1GB'),
  WORKER_INGESTION_CPU_LIMIT: Joi.string().default('1'),

  // Database (shared)
  ...databaseEnvSchema,

  // Embedding (OpenAI)
  ...embeddingEnvSchema,
  OPENAI_API_KEY: secretEnv('OPENAI_API_KEY', { min: 20 }),

  // Logging
  ...loggerEnvSchema,

  // Redis (for BullMQ)
  ...redisEnvSchema,

  // S3 Storage (for document ingestion)
  ...storageEnvSchema,

  // Textract (document text extraction)
  TEXTRACT_MAX_PAGES: Joi.number().default(50),
  TEXTRACT_POLL_INITIAL_DELAY_MS: Joi.number().default(2000),
  TEXTRACT_POLL_MAX_DELAY_MS: Joi.number().default(30000),
  TEXTRACT_POLL_MAX_ATTEMPTS: Joi.number().default(60),
  TEXTRACT_POLL_BACKOFF_MULTIPLIER: Joi.number().default(1.5),
});
