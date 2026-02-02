import { registerAs } from '@nestjs/config';

export default registerAs('workerIngestion', () => ({
  // Worker-specific settings
  port: parseInt(process.env.WORKER_INGESTION_PORT || '3002', 10),
  environment: process.env.NODE_ENV || 'development',

  // Queue configuration
  queueName: process.env.WORKER_INGESTION_QUEUE_NAME || 'data-ingestion-queue',
  concurrency: parseInt(process.env.WORKER_INGESTION_CONCURRENCY || '10', 10),
  maxRetries: parseInt(process.env.WORKER_INGESTION_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WORKER_INGESTION_RETRY_DELAY || '3000', 10),

  // Processing limits
  maxProcessingTime: parseInt(
    process.env.WORKER_INGESTION_MAX_PROCESSING_TIME || '180000',
    10,
  ), // 3 minutes
  batchSize: parseInt(process.env.WORKER_INGESTION_BATCH_SIZE || '50', 10),

  // File processing
  maxFileSize: parseInt(
    process.env.WORKER_INGESTION_MAX_FILE_SIZE || '52428800',
    10,
  ), // 50MB
  allowedFileTypes: (
    process.env.WORKER_INGESTION_ALLOWED_FILE_TYPES || 'pdf,docx,xlsx,csv'
  ).split(','),

  // Storage configuration
  storageType: process.env.WORKER_INGESTION_STORAGE_TYPE || 's3',
  storagePath: process.env.WORKER_INGESTION_STORAGE_PATH || '/tmp/ingestion',

  // Resource limits
  memoryLimit: process.env.WORKER_INGESTION_MEMORY_LIMIT || '1GB',
  cpuLimit: process.env.WORKER_INGESTION_CPU_LIMIT || '1',
}));
