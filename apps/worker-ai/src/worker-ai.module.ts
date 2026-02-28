import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerAiConfig from './config/worker-ai.config';
import { WorkerAiController } from './worker-ai.controller';
import { WorkerAiService } from './worker-ai.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerAiConfig, embeddingConfig, databaseConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ai/.env'],
    }),
    EmbeddingModule.forRoot(),
    DatabaseModule.forRoot(),
  ],
  controllers: [WorkerAiController],
  providers: [WorkerAiService],
})
export class WorkerAiModule {}
