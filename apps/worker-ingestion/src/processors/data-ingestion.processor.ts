import {
  AbstractProcessor,
  INGESTION_JOB_NAMES,
  Job,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import type { RulesetIngestionJobData } from '@lib/queue';
import { Logger } from '@nestjs/common';
import { RulesetIngestionService } from '../services/ruleset-ingestion.service';

@Processor(QUEUE_NAMES.DATA_INGESTION)
export class DataIngestionProcessor extends AbstractProcessor<unknown, void> {
  protected readonly logger = new Logger(DataIngestionProcessor.name);

  constructor(
    private readonly rulesetIngestionService: RulesetIngestionService,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
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
}
