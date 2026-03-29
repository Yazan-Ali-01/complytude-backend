import { registerAs } from '@nestjs/config';

export default registerAs('workerGeneration', () => ({
  port: parseInt(process.env.WORKER_GENERATION_PORT || '3003', 10),
  environment: process.env.NODE_ENV || 'development',

  concurrency: parseInt(process.env.WORKER_GENERATION_CONCURRENCY || '5', 10),
  maxRetries: parseInt(process.env.WORKER_GENERATION_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WORKER_GENERATION_RETRY_DELAY || '5000', 10),

  maxProcessingTime: parseInt(
    process.env.WORKER_GENERATION_MAX_PROCESSING_TIME || '120000',
    10,
  ), // 2 minutes
}));
