import { NestFactory } from '@nestjs/core';
import { WorkerAiModule } from './worker-ai.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAiModule);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await app.close();
    process.exit(0);
  });

  console.log('Worker AI started');
}

bootstrap();
