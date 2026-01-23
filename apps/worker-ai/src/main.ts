import { NestFactory } from '@nestjs/core';
import { WorkerAiModule } from './worker-ai.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('WorkerAI');

  const app = await NestFactory.createApplicationContext(WorkerAiModule);

  logger.log('🚀 Worker AI started successfully');

  // Keep the process running
  // In the future, this will process AI/LLM jobs from a queue
}

bootstrap().catch((err) => {
  console.error('Failed to start Worker AI:', err);
  process.exit(1);
});