import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerIngestionConfig from './config/worker-ingestion.config';
import { WorkerIngestionController } from './worker-ingestion.controller';
import { WorkerIngestionService } from './worker-ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerIngestionConfig, embeddingConfig, databaseConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ingestion/.env'],
    }),
    EmbeddingModule.forRoot(),
    DatabaseModule.forRoot(),
  ],
  controllers: [WorkerIngestionController],
  providers: [WorkerIngestionService],
})
export class WorkerIngestionModule {}
