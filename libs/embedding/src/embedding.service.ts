import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { TokenCounterService } from './chunking/token-counter.service';
import {
  DEFAULT_DIMENSIONS,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL,
  EMBEDDING_MODULE_OPTIONS,
  MAX_BATCH_SIZE,
  MAX_INPUT_TOKENS,
} from './embedding.constants';
import type { EmbeddingResult } from './interfaces/chunking.interface';
import type { EmbeddingModuleConfig } from './interfaces/embedding-config.interface';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dimensions: number;

  constructor(
    @Inject(EMBEDDING_MODULE_OPTIONS)
    private readonly config: EmbeddingModuleConfig,
    private readonly tokenCounter: TokenCounterService,
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? DEFAULT_OPENAI_BASE_URL,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    });
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
  }

  getModel(): string {
    return this.model;
  }

  /** The OpenAI host embeddings are sent to (validated by OPENAI_BASE_URL_PATTERN). */
  getBaseUrl(): string {
    return this.config.baseURL ?? DEFAULT_OPENAI_BASE_URL;
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const tokenCount = this.tokenCounter.countTokens(text);

    if (tokenCount > MAX_INPUT_TOKENS) {
      throw new Error(
        `Text exceeds maximum token limit of ${MAX_INPUT_TOKENS}. Got ${tokenCount} tokens.`,
      );
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });

    return {
      embedding: response.data[0].embedding,
      index: 0,
      tokenCount,
    };
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const tokenCounts = texts.map((text, i) => {
      const count = this.tokenCounter.countTokens(text);
      if (count > MAX_INPUT_TOKENS) {
        throw new Error(
          `Text at index ${i} exceeds maximum token limit of ${MAX_INPUT_TOKENS}. Got ${count} tokens.`,
        );
      }
      return count;
    });

    const results: EmbeddingResult[] = new Array(texts.length);

    for (
      let batchStart = 0;
      batchStart < texts.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batchEnd = Math.min(batchStart + MAX_BATCH_SIZE, texts.length);
      const batch = texts.slice(batchStart, batchEnd);

      this.logger.debug(
        `Generating embeddings for batch ${batchStart}–${batchEnd - 1} of ${texts.length}`,
      );

      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
      });

      for (const item of response.data) {
        const originalIndex = batchStart + item.index;
        results[originalIndex] = {
          embedding: item.embedding,
          index: originalIndex,
          tokenCount: tokenCounts[originalIndex],
        };
      }
    }

    return results;
  }
}
