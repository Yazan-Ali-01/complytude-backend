import {
  AbstractProcessor,
  GENERATION_JOB_NAMES,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import type { DocumentGenerationJobData } from '@lib/queue';
import { Logger } from '@nestjs/common';
import { DocumentGenerationWorkerService } from '../services/document-generation.service';

@Processor(QUEUE_NAMES.DOCUMENT_GENERATION)
export class DocumentGenerationProcessor extends AbstractProcessor<
  unknown,
  void
> {
  protected readonly logger = new Logger(DocumentGenerationProcessor.name);

  constructor(
    private readonly documentGenerationService: DocumentGenerationWorkerService,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case GENERATION_JOB_NAMES.DOCUMENT_GENERATION:
        return this.documentGenerationService.generate(
          job.data as DocumentGenerationJobData,
        );
      default:
        throw new PermanentError(
          `Unknown job name "${job.name}" on ${QUEUE_NAMES.DOCUMENT_GENERATION} queue — no handler registered`,
        );
    }
  }
}
