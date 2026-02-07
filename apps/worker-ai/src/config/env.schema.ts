import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Logging
  SERVICE_NAME: Joi.string().default('worker-ai'),
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

  // Worker AI Port
  WORKER_AI_PORT: Joi.number().default(3001),

  // Queue Configuration
  WORKER_AI_QUEUE_NAME: Joi.string().default('ai-processing-queue'),
  WORKER_AI_CONCURRENCY: Joi.number().default(5),
  WORKER_AI_MAX_RETRIES: Joi.number().default(3),
  WORKER_AI_RETRY_DELAY: Joi.number().default(5000),

  // Processing Limits
  WORKER_AI_MAX_PROCESSING_TIME: Joi.number().default(300000),
  WORKER_AI_BATCH_SIZE: Joi.number().default(10),

  // AI Service
  AI_SERVICE_URL: Joi.string().default('http://localhost:8000'),
  AI_SERVICE_TIMEOUT: Joi.number().default(60000),
  AI_SERVICE_API_KEY: Joi.string().optional(),

  // Resource Limits
  WORKER_AI_MEMORY_LIMIT: Joi.string().default('2GB'),
  WORKER_AI_CPU_LIMIT: Joi.string().default('2'),

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
