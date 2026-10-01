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
  // Output tokens, reasoning tokens included; unset: 4096, or 32000 for a known reasoning model
  OPENAI_CHAT_MAX_TOKENS: Joi.number().integer().min(1),
  // Unset: 0.1 for a known non-reasoning model, none sent otherwise; never sent to a known reasoning model
  OPENAI_CHAT_TEMPERATURE: Joi.number().min(0).max(2),
  OPENAI_CHAT_TIMEOUT: Joi.number().default(120000),

  // Personal data is masked before any text goes to an AI provider; only development may turn it off
  REDACTION_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().valid(true).default(true),
    otherwise: Joi.boolean().default(true),
  }),
  // Self-hosted name recognition (Presidio analyzer API), e.g. a sidecar on http://localhost:5002
  REDACTION_NER_URL: Joi.string().uri({ scheme: ['http', 'https'] }),
  REDACTION_NER_LANGUAGES: Joi.string()
    .pattern(/^[a-z]{2}(,[a-z]{2})*$/)
    .default('en'),
  REDACTION_NER_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),

  // RAG Retrieval Tuning
  // Most clauses taken by similarity (in search order) after each ruleset's required ones
  RAG_OPTIONAL_CLAUSE_LIMIT: Joi.number().integer().min(0).default(25),
  RAG_TOP_K_PER_QUERY: Joi.number().default(5),
  RAG_VECTOR_LIMIT: Joi.number().default(30),
  RAG_BM25_LIMIT: Joi.number().default(30),
  RAG_MAX_HYBRID_RESULTS: Joi.number().default(40),
  // Clause-by-clause judging: clauses per model call, calls at once, calls per analysis, and
  // document sections per clause when the whole document doesn't fit
  RAG_JUDGE_BATCH_SIZE: Joi.number().integer().min(1).max(40).default(8),
  RAG_JUDGE_CONCURRENCY: Joi.number().integer().min(1).max(10).default(3),
  RAG_MAX_JUDGE_CALLS: Joi.number().integer().min(1).max(50).default(10),
  RAG_SECTIONS_PER_CLAUSE: Joi.number().integer().min(1).max(20).default(4),

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
