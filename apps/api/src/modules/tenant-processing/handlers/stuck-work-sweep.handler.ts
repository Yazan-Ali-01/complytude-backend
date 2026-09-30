import {
  ENTITLEMENT_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
  type Job,
  type TenantStuckWorkSweepJobData,
} from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { StuckWorkRepository } from '../../../repositories/maintenance/stuck-work.repository';

/**
 * How long work may stay unfinished before it counts as stuck. Each is above the longest a
 * healthy run takes with all its retries: extraction polls OCR for up to ~27 minutes per
 * attempt (3 attempts), analysis and generation have 5- and 2-minute processing limits.
 */
export const STUCK_WORK_TIMEOUT_MINUTES = {
  documentExtraction: 120,
  analysis: 60,
  generation: 30,
} as const;

const STUCK_ERROR = 'Timed out: no worker finished this in time';

/**
 * Fails documents and jobs stuck in queued/processing, so users see a failure (and can retry)
 * instead of "processing" forever, and refunds the quota of stuck generate jobs, as the
 * generation worker does on a final failure.
 */
@Injectable()
export class StuckWorkSweepHandler {
  private readonly logger = new Logger(StuckWorkSweepHandler.name);

  constructor(
    private readonly stuckWork: StuckWorkRepository,
    private readonly queueProducer: QueueProducerService,
  ) {}

  async execute(_job: Job<TenantStuckWorkSweepJobData>): Promise<void> {
    const documents = await this.stuckWork.failStuckDocumentExtractions(
      STUCK_WORK_TIMEOUT_MINUTES.documentExtraction,
      STUCK_ERROR,
    );
    const analyses = await this.stuckWork.failStuckAnalysisJobs(
      STUCK_WORK_TIMEOUT_MINUTES.analysis,
      STUCK_ERROR,
    );
    const generations = await this.stuckWork.failStuckGenerationJobs(
      STUCK_WORK_TIMEOUT_MINUTES.generation,
      STUCK_ERROR,
    );

    for (const job of generations.filter((g) => g.job_type === 'generate')) {
      await this.queueProducer.enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId: job.tenant_id,
          resourceId: job.id,
          resourceType: 'generation_job',
          featureKey: 'documents_per_month',
          units: 1,
        },
        { jobId: `usage-refund-${job.id}` },
      );
    }

    const total = documents.length + analyses.length + generations.length;
    if (total > 0) {
      this.logger.warn(
        `Failed stuck work: documents=[${documents.join(',')}] analysis_jobs=[${analyses.join(',')}] ` +
          `generation_jobs=[${generations.map((g) => g.id).join(',')}]`,
      );
    }
  }
}
