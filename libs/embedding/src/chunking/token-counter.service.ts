import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { type Tiktoken, get_encoding } from 'tiktoken';

/** `cl100k_base` is what the text-embedding-3 models use; chat models since gpt-4o use `o200k_base`. */
export type TokenEncoding = 'cl100k_base' | 'o200k_base';

const DEFAULT_ENCODING: TokenEncoding = 'cl100k_base';

@Injectable()
export class TokenCounterService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenCounterService.name);
  private readonly encoders = new Map<TokenEncoding, Tiktoken>();

  private getEncoder(encoding: TokenEncoding): Tiktoken {
    let encoder = this.encoders.get(encoding);
    if (!encoder) {
      encoder = get_encoding(encoding);
      this.encoders.set(encoding, encoder);
      this.logger.log(`tiktoken ${encoding} encoder initialized`);
    }
    return encoder;
  }

  countTokens(
    text: string,
    encoding: TokenEncoding = DEFAULT_ENCODING,
  ): number {
    return this.getEncoder(encoding).encode(text).length;
  }

  encode(text: string, encoding: TokenEncoding = DEFAULT_ENCODING): number[] {
    return Array.from(this.getEncoder(encoding).encode(text));
  }

  decodeTokenIds(
    tokenIds: number[],
    encoding: TokenEncoding = DEFAULT_ENCODING,
  ): string {
    const bytes = this.getEncoder(encoding).decode(new Uint32Array(tokenIds));
    return new TextDecoder().decode(bytes);
  }

  truncateToTokens(
    text: string,
    maxTokens: number,
    encoding: TokenEncoding = DEFAULT_ENCODING,
  ): string {
    const tokenIds = this.encode(text, encoding);
    if (tokenIds.length <= maxTokens) {
      return text;
    }
    return this.decodeTokenIds(tokenIds.slice(0, maxTokens), encoding);
  }

  onModuleDestroy(): void {
    for (const [encoding, encoder] of this.encoders) {
      encoder.free();
      this.logger.log(`tiktoken ${encoding} encoder freed`);
    }
    this.encoders.clear();
  }
}
