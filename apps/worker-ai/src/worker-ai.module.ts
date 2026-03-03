import { databaseConfig, DatabaseModule } from '@lib/database';
import { embeddingConfig, EmbeddingModule } from '@lib/embedding';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig } from '@lib/redis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/env.schema';
import workerAiConfig from './config/worker-ai.config';
import { AiProcessingProcessor } from './processors/ai-processing.processor';
import { AnalysisJobWriteRepository } from './repositories/analysis-job-write.repository';
import { DocumentReadRepository } from './repositories/document-read.repository';
import { RulesetChunkSearchRepository } from './repositories/ruleset-chunk-search.repository';
import { DocumentAnalysisService } from './services/document-analysis.service';
import { LlmService } from './services/llm.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { WorkerAiController } from './worker-ai.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerAiConfig, embeddingConfig, databaseConfig, redisConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ai/.env'],
    }),
    EmbeddingModule.forRoot(),
    DatabaseModule.forRoot(),
    QueueModule.forRoot([QUEUE_NAMES.AI_PROCESSING]),
  ],
  controllers: [WorkerAiController],
  providers: [
    AiProcessingProcessor,
    DocumentAnalysisService,
    LlmService,
    PromptBuilderService,
    AnalysisJobWriteRepository,
    DocumentReadRepository,
    RulesetChunkSearchRepository,
  ],
})
export class WorkerAiModule {}
