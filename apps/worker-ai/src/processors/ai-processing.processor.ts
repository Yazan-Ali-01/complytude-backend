import {
  AbstractProcessor,
  AI_JOB_NAMES,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import type { DocumentAnalysisJobData } from '@lib/queue';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentAnalysisService } from '../services/document-analysis.service';

@Processor(QUEUE_NAMES.AI_PROCESSING)
export class AiProcessingProcessor extends AbstractProcessor<unknown, void> {
  protected readonly logger = new Logger(AiProcessingProcessor.name);

  constructor(
    private readonly documentAnalysisService: DocumentAnalysisService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  protected override workerConcurrency(): number | undefined {
    return this.configService.get<number>('workerAi.concurrency');
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case AI_JOB_NAMES.DOCUMENT_ANALYSIS:
        return this.documentAnalysisService.analyze(
          job.data as DocumentAnalysisJobData,
          job.attemptsMade + 1,
          job.opts?.attempts ?? 3,
        );
      default:
        throw new PermanentError(
          `Unknown job name "${job.name}" on ${QUEUE_NAMES.AI_PROCESSING} queue — no handler registered`,
        );
    }
  }
}
