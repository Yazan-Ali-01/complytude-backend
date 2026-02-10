import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { WorkerIngestionModule } from './worker-ingestion.module';

async function bootstrap() {
  // Create application with buffered logs
  const app = await NestFactory.create(WorkerIngestionModule, {
    bufferLogs: true,
  });

  // Replace default logger with Pino logger
  app.useLogger(app.get(PinoLogger));

  // Get logger instance for bootstrap messages
  const logger = new Logger('WorkerIngestion');

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
