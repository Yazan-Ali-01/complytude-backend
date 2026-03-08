import type { DocumentAnalysisJobData } from '@lib/queue';
import {
  AbstractProcessor,
  AI_JOB_NAMES,
  Job,
  PermanentError,
  Processor,
  QUEUE_NAMES,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { CommonI18n } from '../../../api/src/common/constants';
import { DocumentAnalysisService } from '../services/document-analysis.service';

@Processor(QUEUE_NAMES.AI_PROCESSING)
export class AiProcessingProcessor extends AbstractProcessor<unknown, void> {
  protected readonly logger = new Logger(AiProcessingProcessor.name);

  constructor(
    private readonly documentAnalysisService: DocumentAnalysisService,
    @I18n() private readonly i18n: I18nService,
  ) {
    super();
  }

  async handle(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case AI_JOB_NAMES.DOCUMENT_ANALYSIS:
        return this.documentAnalysisService.analyze(
          job.data as DocumentAnalysisJobData,
        );
      default:
        throw new PermanentError(
          // AiProcessingProcessorI18n is required but in phase 2 (AiProcessingProcessorI18n.errors.UNKNOWN_JOB_NAME)
          this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
            `Unknown job name "${job.name}" on ${QUEUE_NAMES.AI_PROCESSING} queue — no handler registered`,
        );
    }
  }
}
