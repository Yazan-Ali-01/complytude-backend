import { NestFactory } from '@nestjs/core';
import { WorkerIngestionModule } from './worker-ingestion.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerIngestionModule);

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

  console.log('Worker Ingestion started');
}

bootstrap();
