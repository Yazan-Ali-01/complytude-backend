import { ContextModule } from '@lib/context';
import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { LoggerModule } from '@lib/logger';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig } from '@lib/redis';
import { storageConfig, StorageModule } from '@lib/storage';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerIngestionConfig from './config/worker-ingestion.config';
import { S3_PROMOTION_SERVICE } from './interfaces/s3-promotion.interface';
import { TEXTRACT_SERVICE } from './interfaces/textract.interface';
import { DataIngestionProcessor } from './processors/data-ingestion.processor';
import { DocumentWriteRepository } from './repositories/document-write.repository';
import { RulesetChunksRepository } from './repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from './repositories/ruleset-version-read.repository';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { S3PromotionStubService } from './services/s3-promotion.stub.service';
import { RulesetIngestionService } from './services/ruleset-ingestion.service';
import { TextractStubService } from './services/textract.stub.service';
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
        storageConfig,
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
    StorageModule.forRoot(),
    QueueModule.forRoot([QUEUE_NAMES.DATA_INGESTION]),
  ],
  controllers: [WorkerIngestionController],
  providers: [
    WorkerIngestionService,
    DataIngestionProcessor,
    RulesetIngestionService,
    RulesetChunksRepository,
    RulesetVersionReadRepository,
    DocumentIngestionService,
    DocumentWriteRepository,
    { provide: TEXTRACT_SERVICE, useClass: TextractStubService },
    { provide: S3_PROMOTION_SERVICE, useClass: S3PromotionStubService },
  ],
})
export class WorkerIngestionModule {}
