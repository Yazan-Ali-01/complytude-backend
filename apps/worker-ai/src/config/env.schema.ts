import { databaseEnvSchema, secretEnv } from '@lib/database';
import { embeddingEnvSchema } from '@lib/embedding';
import { loggerEnvSchema } from '@lib/logger';
import { redisEnvSchema } from '@lib/redis';
import * as Joi from 'joi';
import { KNOWN_CHAT_MODEL_PATTERN } from './chat-model';

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
  // Required for a model outside the known table in chat-model.ts
  OPENAI_CHAT_CONTEXT_WINDOW: Joi.number()
    .integer()
    .min(8192)
    .when('OPENAI_CHAT_MODEL', {
      is: Joi.string().pattern(KNOWN_CHAT_MODEL_PATTERN),
      then: Joi.optional(),
      otherwise: Joi.required(),
    })
    .messages({
      'any.required':
        '"OPENAI_CHAT_CONTEXT_WINDOW" is required when OPENAI_CHAT_MODEL is not a known model (apps/worker-ai/src/config/chat-model.ts)',
    }),
  // Output tokens, reasoning tokens included for reasoning models
  OPENAI_CHAT_MAX_TOKENS: Joi.number().integer().min(1).default(4096),
  // Unset: 0.1 for a known model, none sent for any other (reasoning models reject it)
  OPENAI_CHAT_TEMPERATURE: Joi.number().min(0).max(2),
  OPENAI_CHAT_TIMEOUT: Joi.number().default(120000),

  // Cohere Re-ranking
  COHERE_API_KEY: secretEnv('COHERE_API_KEY', { min: 20 }),
  COHERE_RERANK_MODEL: Joi.string().default('rerank-v3.5'),
  RERANK_TOP_N: Joi.number().default(25),

  // RAG Retrieval Tuning
  RAG_TOP_K_PER_QUERY: Joi.number().default(5),
  RAG_VECTOR_LIMIT: Joi.number().default(30),
  RAG_BM25_LIMIT: Joi.number().default(30),
  RAG_MAX_HYBRID_RESULTS: Joi.number().default(40),

  // Resource Limits
  WORKER_AI_MEMORY_LIMIT: Joi.string().default('2GB'),
  WORKER_AI_CPU_LIMIT: Joi.string().default('2'),

  // Database (shared)
  ...databaseEnvSchema,

  // Embedding (OpenAI)
  ...embeddingEnvSchema,
  OPENAI_API_KEY: secretEnv('OPENAI_API_KEY', { min: 20 }),

  // Logging
  ...loggerEnvSchema,

  // Redis (for BullMQ)
  ...redisEnvSchema,
});
