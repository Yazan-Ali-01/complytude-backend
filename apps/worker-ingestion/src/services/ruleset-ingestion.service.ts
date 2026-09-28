import { DatabaseService } from '@lib/database';
import type { ClauseInput } from '@lib/embedding';
import { ClauseChunkerService, EmbeddingService } from '@lib/embedding';
import type { RulesetIngestionJobData } from '@lib/queue';
import { PermanentError, RetryableError } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RulesetChunkInsertRow,
  RulesetChunksRepository,
} from '../repositories/ruleset-chunks.repository';
import { RulesetVersionReadRepository } from '../repositories/ruleset-version-read.repository';

@Injectable()
export class RulesetIngestionService {
  private readonly logger = new Logger(RulesetIngestionService.name);
  private readonly insertBatchSize: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly rulesetVersionReadRepository: RulesetVersionReadRepository,
    private readonly rulesetChunksRepository: RulesetChunksRepository,
    private readonly clauseChunkerService: ClauseChunkerService,
    private readonly embeddingService: EmbeddingService,
    configService: ConfigService,
  ) {
    this.insertBatchSize = configService.get<number>(
      'workerIngestion.batchSize',
      500,
    );
  }

  async ingest(data: RulesetIngestionJobData): Promise<void> {
    const { rulesetId, versionId } = data;

    this.logger.log(
      `Starting ingestion: rulesetId=${rulesetId} versionId=${versionId}`,
    );

    // 1. Fetch version + ruleset (permanent failure if not found — bad data)
    const version = await this.rulesetVersionReadRepository
      .findById(versionId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching version ${versionId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!version) {
      throw new PermanentError(
        `Ruleset version ${versionId} not found — skipping ingestion`,
      );
    }

    const ruleset = await this.rulesetVersionReadRepository
      .findRulesetWithAuthority(rulesetId)
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error fetching ruleset ${rulesetId}`,
          err instanceof Error ? err : undefined,
        );
      });

    if (!ruleset) {
      throw new PermanentError(
        `Ruleset ${rulesetId} not found — skipping ingestion`,
      );
    }

    // 2. Map JSONB clauses to ClauseInput[]
    const clauseInputs = this.mapClauses(version.clauses);

    if (clauseInputs.length === 0) {
      this.logger.warn(
        `Ruleset "${ruleset.key}" v${version.version} has no clauses — nothing to ingest`,
      );
      return;
    }

    // 3. Chunk the clauses
    const chunks = this.clauseChunkerService.chunkClauses(clauseInputs);

    this.logger.log(
      `Chunked ${clauseInputs.length} clauses into ${chunks.length} chunks for ruleset "${ruleset.key}" v${version.version}`,
    );

    // 4. Generate embeddings (retryable — transient OpenAI failure)
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embeddingService
      .generateEmbeddings(texts)
      .catch((err: unknown) => {
        throw new RetryableError(
          `Embedding API error for ruleset "${ruleset.key}" v${version.version}`,
          err instanceof Error ? err : undefined,
        );
      });

    // 5. Build rows for insert
    const rows: RulesetChunkInsertRow[] = chunks.map((chunk, i) => ({
      rulesetId,
      rulesetVersionId: versionId,
      chunkIndex: chunk.index,
      content: chunk.content,
      embedding: embeddings[i].embedding,
      metadata: {
        clauseId: chunk.clauseId,
        clauseTitle: chunk.clauseTitle,
        clauseOrder: chunk.clauseOrder,
        isPartial: chunk.isPartial,
        ...(chunk.isPartial && {
          partIndex: chunk.partIndex,
          totalParts: chunk.totalParts,
        }),
        tokenCount: chunk.tokenCount,
        authorityName: ruleset.authorityName,
        rulesetKey: ruleset.key,
        version: version.version,
      },
    }));

    // 6. Atomic replace: delete old chunks for this version, insert new ones
    await this.databaseService
      .transaction(async (client) => {
        const deleted = await this.rulesetChunksRepository.deleteByVersionId(
          versionId,
          client,
        );
        await this.rulesetChunksRepository.insertBatch(
          rows,
          client,
          this.insertBatchSize,
        );
        await this.rulesetChunksRepository.deleteInactiveVersionChunks(
          rulesetId,
          client,
        );
        return deleted;
      })
      .catch((err: unknown) => {
        throw new RetryableError(
          `DB error upserting chunks for ruleset "${ruleset.key}" v${version.version}`,
          err instanceof Error ? err : undefined,
        );
      });

    this.logger.log(
      `Ingestion complete: ruleset "${ruleset.key}" v${version.version} — ` +
        `${clauseInputs.length} clauses → ${chunks.length} chunks stored`,
    );
  }

  private mapClauses(clauses: unknown[]): ClauseInput[] {
    // Runtime guard: clauses comes from DB JSONB and can be null, undefined, or malformed
    if (!Array.isArray(clauses)) return [];

    const mapped = clauses
      .filter(
        (c): c is Record<string, unknown> =>
          typeof c === 'object' && c !== null,
      )
      .map((c) => ({
        id: typeof c.id === 'string' ? c.id : '',
        title: typeof c.title === 'string' ? c.title : '',
        content: typeof c.content === 'string' ? c.content : '',
        order: typeof c.order === 'number' ? c.order : 0,
        metadata:
          typeof c.metadata === 'object' && c.metadata !== null
            ? (c.metadata as Record<string, unknown>)
            : null,
      }));

    const valid = mapped.filter((c) => c.id && c.content.trim().length > 0);

    const dropped = mapped.length - valid.length;
    if (dropped > 0) {
      this.logger.warn(
        `Dropped ${dropped} clause(s) with missing id or empty content out of ${clauses.length} total`,
      );
    }

    return valid;
  }
}
