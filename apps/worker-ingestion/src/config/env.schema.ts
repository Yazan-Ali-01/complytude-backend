import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Logging
  SERVICE_NAME: Joi.string().default('worker-ingestion'),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default(
      Joi.ref('NODE_ENV', {
        adjust: (value) => (value === 'production' ? 'info' : 'debug'),
      }),
    ),
  LOG_PRETTY: Joi.boolean().default(
    Joi.ref('NODE_ENV', {
      adjust: (value) => value !== 'production',
    }),
  ),
  LOG_AUTO_LOGGING: Joi.boolean().default(true),

  // Worker Ingestion Port
  WORKER_INGESTION_PORT: Joi.number().default(3002),

  // Queue Configuration
  WORKER_INGESTION_QUEUE_NAME: Joi.string().default('data-ingestion-queue'),
  WORKER_INGESTION_CONCURRENCY: Joi.number().default(10),
  WORKER_INGESTION_MAX_RETRIES: Joi.number().default(3),
  WORKER_INGESTION_RETRY_DELAY: Joi.number().default(3000),

  // Processing Limits
  WORKER_INGESTION_MAX_PROCESSING_TIME: Joi.number().default(180000),
  WORKER_INGESTION_BATCH_SIZE: Joi.number().default(50),

  // File Processing
  WORKER_INGESTION_MAX_FILE_SIZE: Joi.number().default(52428800),
  WORKER_INGESTION_ALLOWED_FILE_TYPES:
    Joi.string().default('pdf,docx,xlsx,csv'),

  // Storage
  WORKER_INGESTION_STORAGE_TYPE: Joi.string().default('s3'),
  WORKER_INGESTION_STORAGE_PATH: Joi.string().default('/tmp/ingestion'),

  // Resource Limits
  WORKER_INGESTION_MEMORY_LIMIT: Joi.string().default('1GB'),
  WORKER_INGESTION_CPU_LIMIT: Joi.string().default('1'),

  // Database (shared)
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_MAX_CONNECTIONS: Joi.number().default(10),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
});
