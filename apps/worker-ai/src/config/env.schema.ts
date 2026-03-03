import { databaseEnvSchema } from '@lib/database';
import { embeddingEnvSchema } from '@lib/embedding';
import { redisEnvSchema } from '@lib/redis';
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Worker AI Port
  WORKER_AI_PORT: Joi.number().default(3001),

  // Queue Configuration
  WORKER_AI_CONCURRENCY: Joi.number().default(5),
  WORKER_AI_MAX_RETRIES: Joi.number().default(3),
  WORKER_AI_RETRY_DELAY: Joi.number().default(5000),

  // Processing Limits
  WORKER_AI_MAX_PROCESSING_TIME: Joi.number().default(300000),

  // LLM (OpenAI Chat)
  OPENAI_CHAT_MODEL: Joi.string().default('gpt-4o-mini'),
  OPENAI_CHAT_MAX_TOKENS: Joi.number().default(4096),
  OPENAI_CHAT_TEMPERATURE: Joi.number().default(0.1),
  OPENAI_CHAT_TIMEOUT: Joi.number().default(120000),

  // Resource Limits
  WORKER_AI_MEMORY_LIMIT: Joi.string().default('2GB'),
  WORKER_AI_CPU_LIMIT: Joi.string().default('2'),

  // Database (shared)
  ...databaseEnvSchema,

  // Embedding (OpenAI)
  ...embeddingEnvSchema,

  // Redis (for BullMQ)
  ...redisEnvSchema,
});
