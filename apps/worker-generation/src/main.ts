import { installProcessErrorHandlers } from '@lib/logger';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { WorkerGenerationModule } from './worker-generation.module';

// Unhandled rejections / uncaught exceptions: log at fatal, close the app, exit 1 (ECS replaces the task)
const processErrors = installProcessErrorHandlers();

async function bootstrap() {
  // Fastify, like the API: Nest's default HTTP driver (Express) is not installed
  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerGenerationModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  processErrors.setShutdown(() => app.close());

  const logger = new NestLogger('WorkerGeneration');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('workerGeneration.port') || 3003;
  const environment =
    configService.get<string>('workerGeneration.environment') || 'development';

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  logger.log(`📄 Worker Generation is running on: http://localhost:${port}`);
  logger.log(`🌍 Environment: ${environment}`);
}

bootstrap().catch((error: unknown) => processErrors.fatal(error, 'bootstrap'));
