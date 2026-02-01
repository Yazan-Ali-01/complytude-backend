import { NestFactory } from '@nestjs/core';
import { WorkerAiModule } from './worker-ai.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerAiModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
