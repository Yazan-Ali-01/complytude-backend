import { Injectable } from '@nestjs/common';
import { DEFAULT_CHUNK_SIZE } from '../embedding.constants.js';
import {
  ChunkOptions,
  ClauseChunk,
  ClauseInput,
} from '../interfaces/chunking.interface.js';
import { TextChunkerService } from './text-chunker.service.js';
import { TokenCounterService } from './token-counter.service.js';

@Injectable()
export class ClauseChunkerService {
  constructor(
    private readonly tokenCounter: TokenCounterService,
    private readonly textChunker: TextChunkerService,
  ) {}

  chunkClauses(clauses: ClauseInput[], options?: ChunkOptions): ClauseChunk[] {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const results: ClauseChunk[] = [];
    let globalIndex = 0;

    for (const clause of clauses) {
      if (!clause.content || clause.content.trim().length === 0) {
        continue;
      }

      const tokenCount = this.tokenCounter.countTokens(clause.content);

      if (tokenCount <= chunkSize) {
        results.push({
          content: clause.content,
          index: globalIndex++,
          tokenCount,
          clauseId: clause.id,
          clauseTitle: clause.title,
          clauseOrder: clause.order,
          isPartial: false,
          metadata: clause.metadata,
        });
      } else {
        const subChunks = this.textChunker.chunk(clause.content, options);
        const totalParts = subChunks.length;

        for (const subChunk of subChunks) {
          results.push({
            content: subChunk.content,
            index: globalIndex++,
            tokenCount: subChunk.tokenCount,
            clauseId: clause.id,
            clauseTitle: clause.title,
            clauseOrder: clause.order,
            isPartial: true,
            partIndex: subChunk.index,
            totalParts,
            metadata: clause.metadata,
          });
        }
      }
    }

    return results;
  }
}
