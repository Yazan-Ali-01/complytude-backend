import { Injectable, Logger } from '@nestjs/common';
import { PermanentError } from '@lib/queue';
import type {
  ITextractService,
  TextractResult,
} from '../interfaces/textract.interface';

/**
 * Stub implementation of ITextractService.
 * Throws PermanentError — pipeline is blocked until COM-209 lands.
 * Replace with real AWS Textract integration in COM-209.
 */
@Injectable()
export class TextractStubService implements ITextractService {
  private readonly logger = new Logger(TextractStubService.name);

  extractText(
    bucket: string,
    key: string,
    _mimeType: string,
  ): Promise<TextractResult> {
    this.logger.warn(
      `[STUB] TextractService not yet implemented — bucket=${bucket} key=${key}. Blocked on COM-209.`,
    );

    throw new PermanentError(
      'TextractService not yet implemented. Blocked on COM-209.',
    );
  }
}
