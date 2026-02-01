import { registerAs } from '@nestjs/config';

export default registerAs('workerAi', () => ({
  // Worker-specific settings
  port: parseInt(process.env.WORKER_AI_PORT || '3001', 10),
  environment: process.env.NODE_ENV || 'development',

  // Queue configuration
  queueName: process.env.WORKER_AI_QUEUE_NAME || 'ai-processing-queue',
  concurrency: parseInt(process.env.WORKER_AI_CONCURRENCY || '5', 10),
  maxRetries: parseInt(process.env.WORKER_AI_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WORKER_AI_RETRY_DELAY || '5000', 10),

  // Processing limits
  maxProcessingTime: parseInt(
    process.env.WORKER_AI_MAX_PROCESSING_TIME || '300000',
    10,
  ), // 5 minutes
  batchSize: parseInt(process.env.WORKER_AI_BATCH_SIZE || '10', 10),

  // AI Service configuration
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  aiServiceTimeout: parseInt(process.env.AI_SERVICE_TIMEOUT || '60000', 10),
  aiServiceApiKey: process.env.AI_SERVICE_API_KEY,

  // Resource limits
  memoryLimit: process.env.WORKER_AI_MEMORY_LIMIT || '2GB',
  cpuLimit: process.env.WORKER_AI_CPU_LIMIT || '2',
}));
