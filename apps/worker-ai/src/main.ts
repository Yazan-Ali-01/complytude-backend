import { installProcessErrorHandlers } from '@lib/logger';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { WorkerAiModule } from './worker-ai.module';

// Unhandled rejections / uncaught exceptions: log at fatal, close the app, exit 1 (ECS replaces the task)
const processErrors = installProcessErrorHandlers();

async function bootstrap() {
  // Fastify, like the API: Nest's default HTTP driver (Express) is not installed
  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerAiModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  processErrors.setShutdown(() => app.close());

  const logger = new NestLogger('WorkerAI');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerAi.port') || 3001;
  const environment =
    configService.get<string>('workerAi.environment') || 'development';
  const model =
    configService.get<string>('workerAi.llmModel') || 'gpt-5.6-luna';

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`🤖 Worker AI is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`🧠 LLM model: ${model}`);
}

bootstrap().catch((error: unknown) => processErrors.fatal(error, 'bootstrap'));
