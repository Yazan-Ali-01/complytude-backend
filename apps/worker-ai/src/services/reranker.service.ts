import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CohereClient } from 'cohere-ai';
import type { RulesetChunkMatch } from '../repositories/ruleset-chunk-search.repository';

export interface RerankResult {
  chunks: RulesetChunkMatch[];
  reranked: boolean;
}

@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly client: CohereClient;
  private readonly model: string;
  private readonly topN: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('workerAi.cohereApiKey');

    if (!apiKey) {
      throw new Error('COHERE_API_KEY is required for RerankerService');
    }

    this.model = this.configService.get<string>(
      'workerAi.cohereRerankModel',
      'rerank-v3.5',
    );
    this.topN = this.configService.get<number>('workerAi.rerankTopN', 10);

    this.client = new CohereClient({ token: apiKey });

    this.logger.log(
      `RerankerService initialized with model=${this.model} topN=${this.topN}`,
    );
  }

  /**
   * Re-rank retrieved chunks using Cohere's rerank model.
   * Falls back to the original ranking (truncated to topN) if the API call fails,
   * so a Cohere outage doesn't break the pipeline.
   */
  async rerank(
    query: string,
    chunks: RulesetChunkMatch[],
  ): Promise<RerankResult> {
    if (chunks.length === 0) {
      return { chunks: [], reranked: false };
    }

    if (chunks.length <= this.topN) {
      return { chunks, reranked: false };
    }

    try {
      const response = await this.client.v2.rerank({
        model: this.model,
        query,
        documents: chunks.map((c) => c.content),
        topN: this.topN,
      });

      const reranked = response.results.map((r) => ({
        ...chunks[r.index],
        score: r.relevanceScore,
      }));

      this.logger.log(
        `Cohere rerank: ${chunks.length} → ${reranked.length} chunks (model=${this.model})`,
      );

      return { chunks: reranked, reranked: true };
    } catch (error) {
      this.logger.warn(
        `Cohere rerank failed, falling back to original ranking: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { chunks: chunks.slice(0, this.topN), reranked: false };
    }
  }
}
