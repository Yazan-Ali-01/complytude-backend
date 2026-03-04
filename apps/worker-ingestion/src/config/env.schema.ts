import { databaseEnvSchema } from '@lib/database';
import { embeddingEnvSchema } from '@lib/embedding';
import { redisEnvSchema } from '@lib/redis';
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

  // Redis (for BullMQ)
  ...redisEnvSchema,
});
