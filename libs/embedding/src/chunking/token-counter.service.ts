import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { type Tiktoken, get_encoding } from 'tiktoken';

@Injectable()
export class TokenCounterService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenCounterService.name);
  private encoder: Tiktoken | null = null;

  private getEncoder(): Tiktoken {
    if (!this.encoder) {
      this.encoder = get_encoding('cl100k_base');
      this.logger.log('tiktoken cl100k_base encoder initialized');
    }
    return this.encoder;
  }

  countTokens(text: string): number {
    return this.getEncoder().encode(text).length;
  }

  encode(text: string): number[] {
    return Array.from(this.getEncoder().encode(text));
  }

  decodeTokenIds(tokenIds: number[]): string {
    const bytes = this.getEncoder().decode(new Uint32Array(tokenIds));
    return new TextDecoder().decode(bytes);
  }

  truncateToTokens(text: string, maxTokens: number): string {
    const tokenIds = this.encode(text);
    if (tokenIds.length <= maxTokens) {
      return text;
    }
    return this.decodeTokenIds(tokenIds.slice(0, maxTokens));
  }

  onModuleDestroy(): void {
    if (this.encoder) {
      this.encoder.free();
      this.encoder = null;
      this.logger.log('tiktoken encoder freed');
    }
  }
}
