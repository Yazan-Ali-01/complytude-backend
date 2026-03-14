import { ContextModule } from '@lib/context';
import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { LoggerModule } from '@lib/logger';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig } from '@lib/redis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerIngestionConfig from './config/worker-ingestion.config';
import { DataIngestionProcessor } from './processors/data-ingestion.processor';
import { RulesetChunksRepository } from './repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from './repositories/ruleset-version-read.repository';
import { RulesetIngestionService } from './services/ruleset-ingestion.service';
import { WorkerIngestionController } from './worker-ingestion.controller';
import { WorkerIngestionService } from './worker-ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        workerIngestionConfig,
        embeddingConfig,
        databaseConfig,
        redisConfig,
      ],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ingestion/.env'],
    }),
    ContextModule.forRoot(),
    LoggerModule.forRoot({ serviceName: 'worker-ingestion' }),
    EmbeddingModule.forRoot(),
    DatabaseModule.forRoot(),
    QueueModule.forRoot([QUEUE_NAMES.DATA_INGESTION]),
  ],
  controllers: [WorkerIngestionController],
  providers: [
    WorkerIngestionService,
    DataIngestionProcessor,
    RulesetIngestionService,
    RulesetChunksRepository,
    RulesetVersionReadRepository,
  ],
})
export class WorkerIngestionModule {}
