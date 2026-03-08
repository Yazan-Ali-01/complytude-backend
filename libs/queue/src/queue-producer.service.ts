import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';
import { I18n, I18nService } from 'nestjs-i18n';
import { CommonI18n } from '../../../apps/api/src/common/constants';
import { JobDataFor, JobNameFor, QueueName } from './queue-job-map';
import { QUEUE_NAMES } from './queue.constants';

@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    @Optional()
    @Inject(getQueueToken(QUEUE_NAMES.AI_PROCESSING))
    aiQueue: Queue | null,
    @Optional()
    @Inject(getQueueToken(QUEUE_NAMES.DATA_INGESTION))
    ingestionQueue: Queue | null,
    @Optional()
    @Inject(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING))
    entitlementQueue: Queue | null,
    @I18n() private readonly i18n: I18nService,
  ) {
    if (aiQueue) this.queues.set(QUEUE_NAMES.AI_PROCESSING, aiQueue);
    if (ingestionQueue)
      this.queues.set(QUEUE_NAMES.DATA_INGESTION, ingestionQueue);
    if (entitlementQueue)
      this.queues.set(QUEUE_NAMES.ENTITLEMENT_PROCESSING, entitlementQueue);
  }

  async enqueue<Q extends QueueName, J extends JobNameFor<Q>>(
    queueName: Q,
    jobName: J,
    data: JobDataFor<Q, J>,
    opts?: JobsOptions,
  ): Promise<Job<JobDataFor<Q, J>>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(
        // QueueProducerServiceI18n is required but in phase 2 (QueueProducerServiceI18n.errors.QUEUE_NOT_REGISTERED)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          `Queue "${queueName}" is not registered`,
      );
    }
    const job = await queue.add(jobName, data, opts);
    this.logger.debug(
      `Enqueued job ${jobName} on ${queueName} [jobId=${job.id}]`,
    );
    return job as Job<JobDataFor<Q, J>>;
  }

  async enqueueBulk<Q extends QueueName, J extends JobNameFor<Q>>(
    queueName: Q,
    jobs: Array<{ name: J; data: JobDataFor<Q, J>; opts?: JobsOptions }>,
  ): Promise<Job<JobDataFor<Q, J>>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(
        // QueueProducerServiceI18n is required but in phase 2 (QueueProducerServiceI18n.errors.QUEUE_NOT_REGISTERED)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          `Queue "${queueName}" is not registered`,
      );
    }
    const result = await queue.addBulk(
      jobs.map((j) => ({ name: j.name, data: j.data, opts: j.opts })),
    );
    this.logger.debug(`Enqueued ${result.length} jobs on ${queueName}`);
    return result as Job<JobDataFor<Q, J>>[];
  }
}
