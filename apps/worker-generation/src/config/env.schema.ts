import { databaseEnvSchema } from '@lib/database';
import { loggerEnvSchema } from '@lib/logger';
import { redisEnvSchema } from '@lib/redis';
import { storageEnvSchema } from '@lib/storage';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  WORKER_GENERATION_PORT: Joi.number().default(3003),

  WORKER_GENERATION_CONCURRENCY: Joi.number().default(5),
  WORKER_GENERATION_MAX_RETRIES: Joi.number().default(3),
  WORKER_GENERATION_RETRY_DELAY: Joi.number().default(5000),

  WORKER_GENERATION_MAX_PROCESSING_TIME: Joi.number().default(120000),

  ...databaseEnvSchema,
  ...storageEnvSchema,
  ...loggerEnvSchema,
  ...redisEnvSchema,
});
