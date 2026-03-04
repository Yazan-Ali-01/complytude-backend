import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WorkerAiModule } from './worker-ai.module';

async function bootstrap() {
  const logger = new Logger('WorkerAI');

  const app = await NestFactory.create(WorkerAiModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerAi.port') || 3001;
  const environment =
    configService.get<string>('workerAi.environment') || 'development';
  const model = configService.get<string>('workerAi.llmModel') || 'gpt-4o-mini';

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`🤖 Worker AI is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`🧠 LLM model: ${model}`);
}

void bootstrap();
