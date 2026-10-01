import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NerClient } from './ner.client';
import { identityRedaction, redact, type Redaction } from './redactor';

export class RedactionError extends Error {}

/**
 * Masks personal data in a contract before chunking, embeddings or the prompt see it.
 * Any failure throws: the pipeline must not send unredacted text instead.
 */
@Injectable()
export class RedactionService {
  private readonly logger = new Logger(RedactionService.name);
  private readonly enabled: boolean;
  private readonly ner: NerClient | null;

  constructor(configService: ConfigService) {
    this.enabled = configService.get<boolean>(
      'workerAi.redactionEnabled',
      true,
    );
    const nerUrl = configService.get<string>('workerAi.redactionNerUrl');
    this.ner = nerUrl
      ? new NerClient(
          nerUrl,
          configService.get<string[]>('workerAi.redactionNerLanguages', ['en']),
          configService.get<number>('workerAi.redactionNerTimeoutMs', 10000),
        )
      : null;

    if (!this.enabled) {
      this.logger.warn(
        'Redaction is OFF: contract text goes to the AI providers unmasked (development only)',
      );
    } else if (!this.ner) {
      this.logger.warn(
        'No name-recognition service (REDACTION_NER_URL): only names in the preamble, after an honorific or a "Name:" label are masked',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async redact(text: string): Promise<Redaction> {
    if (!this.enabled) return identityRedaction(text);
    try {
      const names = this.ner ? await this.ner.persons(text) : [];
      return redact(text, names);
    } catch (error) {
      throw new RedactionError(
        `Redaction failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}
