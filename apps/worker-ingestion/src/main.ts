import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WorkerIngestionModule } from './worker-ingestion.module';

async function bootstrap() {
  const logger = new Logger('WorkerIngestion');

  const app = await NestFactory.create(WorkerIngestionModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerIngestion.port') || 3002;
  const environment =
    configService.get<string>('workerIngestion.environment') || 'development';
  const queueName = configService.get<string>('workerIngestion.queueName');

  await app.listen(port, '0.0.0.0');

  logger.log(`📥 Worker Ingestion is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`📬 Queue: ${queueName}`);
}

void bootstrap();
