import { TextractClient } from '@aws-sdk/client-textract';
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
import { textractConfig } from './config/textract.config';
import workerIngestionConfig from './config/worker-ingestion.config';
import { S3_PROMOTION_SERVICE } from './interfaces/s3-promotion.interface';
import {
  TEXTRACT_CLIENT,
  TEXTRACT_SERVICE,
} from './interfaces/textract.interface';
import { DataIngestionProcessor } from './processors/data-ingestion.processor';
import { DocumentWriteRepository } from './repositories/document-write.repository';
import { RulesetChunksRepository } from './repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from './repositories/ruleset-version-read.repository';
import { DocumentIngestionService } from './services/document-ingestion.service';
import { S3PromotionService } from './services/s3-promotion.service';
import { RulesetIngestionService } from './services/ruleset-ingestion.service';
import { TextractService } from './services/textract.service';
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
        textractConfig,
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
    DocumentIngestionService,
    DocumentWriteRepository,
    {
      provide: TEXTRACT_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const region = configService.get<string>('storage.s3.region')!;
        // Textract has no local substitute — always hits real AWS.
        // Credentials come from the default SDK chain:
        //   Production: ECS task role
        //   Local dev: ~/.aws/credentials or AWS_ACCESS_KEY_ID env var
        return new TextractClient({ region });
      },
    },
    { provide: TEXTRACT_SERVICE, useClass: TextractService },
    { provide: S3_PROMOTION_SERVICE, useClass: S3PromotionService },
  ],
})
export class WorkerIngestionModule {}
