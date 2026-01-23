import { NestFactory } from '@nestjs/core';
import { WorkerIngestionModule } from './worker-ingestion.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('WorkerIngestion');

  const app = await NestFactory.createApplicationContext(WorkerIngestionModule);

  logger.log('🚀 Worker Ingestion started successfully');

  // Keep the process running
  // In the future, this will process jobs from a queue (BullMQ)
}

bootstrap().catch((err) => {
  console.error('Failed to start Worker Ingestion:', err);
  process.exit(1);
});