import { ContextModule } from '@lib/context';
import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { LoggerModule } from '@lib/logger';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig } from '@lib/redis';
import { storageConfig, StorageModule } from '@lib/storage';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import { ocrConfig } from './config/ocr.config';
import workerIngestionConfig from './config/worker-ingestion.config';
import { S3_PROMOTION_SERVICE } from './interfaces/s3-promotion.interface';
import {
  DOCUMENT_INTELLIGENCE_CLIENT,
  OCR_SERVICE,
} from './interfaces/ocr.interface';
import { DataIngestionProcessor } from './processors/data-ingestion.processor';
import { DocumentWriteRepository } from './repositories/document-write.repository';
import { RulesetChunksRepository } from './repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from './repositories/ruleset-version-read.repository';
import { RulesetVersionStatusRepository } from './repositories/ruleset-version-status.repository';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { S3PromotionService } from './services/s3-promotion.service';
import { RulesetIngestionService } from './services/ruleset-ingestion.service';
import { DocumentIntelligenceClient } from './services/document-intelligence.client';
import { DocumentIntelligenceService } from './services/document-intelligence.service';
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
        ocrConfig,
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
    QueueModule.forRoot([
      QUEUE_NAMES.DATA_INGESTION,
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
    ]),
  ],
  controllers: [WorkerIngestionController],
  providers: [
    WorkerIngestionService,
    DataIngestionProcessor,
    RulesetIngestionService,
    RulesetChunksRepository,
    RulesetVersionReadRepository,
    RulesetVersionStatusRepository,
    DocumentIngestionService,
    DocumentWriteRepository,
    {
      provide: DOCUMENT_INTELLIGENCE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        // No local substitute: scanned pages always go to the configured resource
        new DocumentIntelligenceClient(
          configService.get<string>('ocr.endpoint', ''),
          configService.get<string>('ocr.key', ''),
        ),
    },
    { provide: OCR_SERVICE, useClass: DocumentIntelligenceService },
    { provide: S3_PROMOTION_SERVICE, useClass: S3PromotionService },
  ],
})
export class WorkerIngestionModule {}
