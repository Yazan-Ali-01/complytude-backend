import { registerAs } from '@nestjs/config';

export default registerAs('workerIngestion', () => ({
  port: parseInt(process.env.WORKER_INGESTION_PORT || '3002', 10),
  environment: process.env.NODE_ENV || 'development',

  concurrency: parseInt(process.env.WORKER_INGESTION_CONCURRENCY || '10', 10),
  maxRetries: parseInt(process.env.WORKER_INGESTION_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WORKER_INGESTION_RETRY_DELAY || '3000', 10),

  maxProcessingTime: parseInt(
    process.env.WORKER_INGESTION_MAX_PROCESSING_TIME || '180000',
    10,
  ),
  batchSize: parseInt(process.env.WORKER_INGESTION_BATCH_SIZE || '500', 10),

  // Promote an upload only once GuardDuty Malware Protection has tagged it clean
  malwareScanRequired: process.env.MALWARE_SCAN_REQUIRED === 'true',
  malwareScanWaitMs: parseInt(process.env.MALWARE_SCAN_WAIT_MS || '60000', 10),

  memoryLimit: process.env.WORKER_INGESTION_MEMORY_LIMIT || '1GB',
  cpuLimit: process.env.WORKER_INGESTION_CPU_LIMIT || '1',
}));
