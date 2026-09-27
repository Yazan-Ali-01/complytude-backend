import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerGenerationModule } from './worker-generation.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerGenerationModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

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

void bootstrap();
