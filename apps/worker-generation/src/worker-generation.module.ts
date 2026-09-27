import { ContextModule } from '@lib/context';
import { databaseConfig, DatabaseModule } from '@lib/database';
import { DocxRendererModule } from '@lib/docx-renderer';
import { LoggerModule } from '@lib/logger';
import { PdfModule } from '@lib/pdf';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig } from '@lib/redis';
import { storageConfig, StorageModule } from '@lib/storage';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerGenerationConfig from './config/worker-generation.config';
import { DocumentGenerationProcessor } from './processors/document-generation.processor';
import { DocumentWriteRepository } from './repositories/document-write.repository';
import { GenerationJobWriteRepository } from './repositories/generation-job-write.repository';
import { DocumentGenerationWorkerService } from './services/document-generation.service';
import { WorkerGenerationController } from './worker-generation.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        workerGenerationConfig,
        databaseConfig,
        redisConfig,
        storageConfig,
      ],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-generation/.env'],
    }),
    ContextModule.forRoot(),
    LoggerModule.forRoot({ serviceName: 'worker-generation' }),
    DatabaseModule.forRoot(),
    StorageModule.forRoot(),
    DocxRendererModule,
    PdfModule,
    QueueModule.forRoot([
      QUEUE_NAMES.DOCUMENT_GENERATION,
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
    ]),
  ],
  controllers: [WorkerGenerationController],
  providers: [
    DocumentGenerationProcessor,
    DocumentGenerationWorkerService,
    GenerationJobWriteRepository,
    DocumentWriteRepository,
  ],
})
export class WorkerGenerationModule {}
