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

  // Malware scan before promotion: an unscanned upload never reaches the clean bucket in production
  MALWARE_SCAN_REQUIRED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().valid(true).default(true),
    otherwise: Joi.boolean().default(false),
  }),
  MALWARE_SCAN_WAIT_MS: Joi.number().integer().min(0).default(60000),

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

  // Most pages a PDF may have, read locally or by OCR (OCR bills per page); the API's must match
  DOCUMENT_MAX_PAGES: Joi.number().integer().min(1).default(50),

  // OCR of scanned pages: Azure AI Document Intelligence
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['https'] })
      .allow('')
      .optional(),
  }),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: secretEnv('AZURE_DOCUMENT_INTELLIGENCE_KEY', { min: 32 }),
    otherwise: Joi.string().allow('').optional(),
  }),
  OCR_POLL_INITIAL_DELAY_MS: Joi.number().default(2000),
  OCR_POLL_MAX_DELAY_MS: Joi.number().default(30000),
  OCR_POLL_MAX_ATTEMPTS: Joi.number().default(60),
  OCR_POLL_BACKOFF_MULTIPLIER: Joi.number().default(1.5),

  // A PDF page with fewer letters and digits in its text layer, and an image, goes to OCR
  PDF_TEXT_MIN_CHARS_PER_PAGE: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(50),
});
