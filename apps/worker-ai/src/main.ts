import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { WorkerAiModule } from './worker-ai.module';

async function bootstrap() {
  // Create application with buffered logs
  const app = await NestFactory.create(WorkerAiModule, {
    bufferLogs: true,
  });

  // Replace default logger with Pino logger
  app.useLogger(app.get(PinoLogger));

  // Get logger instance for bootstrap messages
  const logger = new Logger('WorkerAI');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerAi.port') || 3001;
  const environment =
    configService.get<string>('workerAi.environment') || 'development';
  const queueName = configService.get<string>('workerAi.queueName');

  await app.listen(port, '0.0.0.0');

  logger.log(`🤖 Worker AI is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`📬 Queue: ${queueName}`);
}

void bootstrap();
