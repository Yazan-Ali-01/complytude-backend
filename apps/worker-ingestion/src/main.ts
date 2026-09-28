import { installProcessErrorHandlers } from '@lib/logger';
import { QUEUE_NAMES } from '@lib/queue';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerIngestionModule } from './worker-ingestion.module';

// Unhandled rejections / uncaught exceptions: log at fatal, close the app, exit 1 (ECS replaces the task)
const processErrors = installProcessErrorHandlers();

async function bootstrap() {
  const app = await NestFactory.create(WorkerIngestionModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  processErrors.setShutdown(() => app.close());

  const logger = new NestLogger('WorkerIngestion');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerIngestion.port') || 3002;
  const environment =
    configService.get<string>('workerIngestion.environment') || 'development';
  const queueName = QUEUE_NAMES.DATA_INGESTION;

  // On SIGTERM close the BullMQ worker: it stops taking jobs and waits for the active ones
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`📥 Worker Ingestion is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`📬 Queue: ${queueName}`);
}

bootstrap().catch((error: unknown) => processErrors.fatal(error, 'bootstrap'));
