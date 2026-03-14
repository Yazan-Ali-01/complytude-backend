import { QUEUE_NAMES } from '@lib/queue';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerIngestionModule } from './worker-ingestion.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerIngestionModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const logger = new NestLogger('WorkerIngestion');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerIngestion.port') || 3002;
  const environment =
    configService.get<string>('workerIngestion.environment') || 'development';
  const queueName = QUEUE_NAMES.DATA_INGESTION;

  await app.listen(port, '0.0.0.0');

  logger.log(`📥 Worker Ingestion is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`📬 Queue: ${queueName}`);
}

void bootstrap();
