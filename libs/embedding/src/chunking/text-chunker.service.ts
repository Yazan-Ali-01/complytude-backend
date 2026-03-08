import { Injectable } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { CommonI18n } from '../../../../apps/api/src/common/constants';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
} from '../embedding.constants';
import { ChunkOptions, TextChunk } from '../interfaces/chunking.interface';
import { TokenCounterService } from './token-counter.service';

@Injectable()
export class TextChunkerService {
  constructor(
    private readonly tokenCounter: TokenCounterService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  chunk(text: string, options?: ChunkOptions): TextChunk[] {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

    if (chunkOverlap >= chunkSize) {
      throw new Error(
        // TextChunkerServiceI18n is required but in phase 2 (TextChunkerServiceI18n.errors.CHUNK_OVERLAP_MUST_BE_LESS_THAN_CHUNK_SIZE)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
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
