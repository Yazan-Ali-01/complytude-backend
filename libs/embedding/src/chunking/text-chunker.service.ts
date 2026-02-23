import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
} from '../embedding.constants.js';
import { ChunkOptions, TextChunk } from '../interfaces/chunking.interface.js';
import { TokenCounterService } from './token-counter.service.js';

@Injectable()
export class TextChunkerService {
  constructor(private readonly tokenCounter: TokenCounterService) {}

  chunk(text: string, options?: ChunkOptions): TextChunk[] {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

    if (chunkOverlap >= chunkSize) {
      throw new Error(
        `chunkOverlap (${chunkOverlap}) must be less than chunkSize (${chunkSize})`,
      );
    }

    const tokenIds = this.tokenCounter.encode(text);

    if (tokenIds.length === 0) {
      return [];
    }

    const chunks: TextChunk[] = [];
    const step = chunkSize - chunkOverlap;
    let index = 0;

    for (let start = 0; start < tokenIds.length; start += step) {
      const end = Math.min(start + chunkSize, tokenIds.length);
      const chunkTokenIds = tokenIds.slice(start, end);
      const content = this.tokenCounter.decodeTokenIds(chunkTokenIds);

      chunks.push({
        content,
        index: index++,
        tokenCount: chunkTokenIds.length,
      });
    }

    return chunks;
  }
}
