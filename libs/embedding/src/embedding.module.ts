import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClauseChunkerService } from './chunking/clause-chunker.service';
import { TextChunkerService } from './chunking/text-chunker.service';
import { TokenCounterService } from './chunking/token-counter.service';
import { EMBEDDING_MODULE_OPTIONS } from './embedding.constants';
import { EmbeddingService } from './embedding.service';
import type { EmbeddingModuleConfig } from './interfaces/embedding-config.interface';

@Global()
@Module({})
export class EmbeddingModule {
  static forRoot(): DynamicModule {
    return {
      module: EmbeddingModule,
      providers: [
        {
          provide: EMBEDDING_MODULE_OPTIONS,
          useFactory: (configService: ConfigService) => {
            const config =
              configService.get<EmbeddingModuleConfig>('embedding');

            if (!config) {
              throw new Error(
                'Embedding configuration not found. Make sure embeddingConfig is loaded in ConfigModule.',
              );
            }

            if (!config.apiKey) {
              throw new Error(
                'OPENAI_API_KEY is required for the embedding module.',
              );
            }

            return config;
          },
          inject: [ConfigService],
        },
        TokenCounterService,
        TextChunkerService,
        ClauseChunkerService,
        EmbeddingService,
      ],
      exports: [
        TokenCounterService,
        TextChunkerService,
        ClauseChunkerService,
        EmbeddingService,
      ],
    };
  }
}
