import {
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { RulesetVersionRepository } from 'src/repositories/rulesets/ruleset-version.repository';

export interface ReingestedVersion {
  rulesetId: string;
  versionId: string;
  version: string;
  jobId: string | undefined;
}

/**
 * Re-queues ingestion for every active ruleset version, so existing chunks are rebuilt with what
 * ingestion stores today (e.g. the clause's article, severity and whether it is mandatory).
 */
@Injectable()
export class RulesetReingestService {
  private readonly logger = new Logger(RulesetReingestService.name);

  constructor(
    private readonly rulesetVersionRepository: RulesetVersionRepository,
    private readonly queueProducerService: QueueProducerService,
  ) {}

  async reingestActiveVersions(): Promise<ReingestedVersion[]> {
    const versions = await this.rulesetVersionRepository.findAllActive();
    const queued: ReingestedVersion[] = [];
    for (const version of versions) {
      // No job ID: a version ingested before is ingested again (its chunks are replaced atomically)
      const job = await this.queueProducerService.enqueue(
        QUEUE_NAMES.DATA_INGESTION,
        INGESTION_JOB_NAMES.RULESET_INGESTION,
        { rulesetId: version.rulesetId, versionId: version.id },
      );
      queued.push({
        rulesetId: version.rulesetId,
        versionId: version.id,
        version: version.version,
        jobId: job.id,
      });
    }
    this.logger.log(`Queued re-ingestion of ${queued.length} ruleset versions`);
    return queued;
  }
}
