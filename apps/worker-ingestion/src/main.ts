import { NestFactory } from '@nestjs/core';
import { WorkerIngestionModule } from './worker-ingestion.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerIngestionModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
