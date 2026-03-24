import {
  AbstractProcessor,
  INGESTION_JOB_NAMES,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import type {
  DocumentIngestionJobData,
  RulesetIngestionJobData,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { DocumentIngestionService } from '../services/document-ingestion.service';
import { RulesetIngestionService } from '../services/ruleset-ingestion.service';

@Processor(QUEUE_NAMES.DATA_INGESTION)
export class DataIngestionProcessor extends AbstractProcessor<unknown, void> {
  protected readonly logger = new Logger(DataIngestionProcessor.name);

  constructor(
    private readonly rulesetIngestionService: RulesetIngestionService,
    private readonly documentIngestionService: DocumentIngestionService,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case INGESTION_JOB_NAMES.DOCUMENT_INGESTION:
        return this.documentIngestionService.process(
          job.data as DocumentIngestionJobData,
        );
      case INGESTION_JOB_NAMES.RULESET_INGESTION:
        return this.rulesetIngestionService.ingest(
          job.data as RulesetIngestionJobData,
        );
      default:
        this.logger.warn(
          `Unknown job name "${job.name}" on ${QUEUE_NAMES.DATA_INGESTION} queue — skipping`,
        );
    }
  }

  protected override async onPermanentFailure(
    job: Job<unknown>,
    error: PermanentError,
  ): Promise<void> {
    if (job.name === INGESTION_JOB_NAMES.DOCUMENT_INGESTION) {
      const data = job.data as DocumentIngestionJobData;
      await this.documentIngestionService.markFailed(
        data.documentId,
        error.message,
      );
    }
  }

  protected override onDeadLetter(job: Job<unknown>, error: Error): void {
    super.onDeadLetter(job, error);

    if (job.name === INGESTION_JOB_NAMES.DOCUMENT_INGESTION) {
      const data = job.data as DocumentIngestionJobData;
      void this.documentIngestionService.markFailed(
        data.documentId,
        `Exhausted all retries: ${error.message}`,
      );
    }
  }
}
