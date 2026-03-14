import { CLS_TENANT_ID, CLS_TRACE_ID } from '@lib/context';
import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { JobMetadata } from './interfaces/job-metadata.interface';
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
    @Inject(getQueueToken(QUEUE_NAMES.BILLING_PROCESSING))
    billingQueue: Queue | null,
    @Inject(getQueueToken(QUEUE_NAMES.DATA_INGESTION))
    ingestionQueue: Queue | null,
    @Optional()
    @Inject(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING))
    entitlementQueue: Queue | null,
    @Optional()
    private readonly cls: ClsService | null,
  ) {
    if (aiQueue) this.queues.set(QUEUE_NAMES.AI_PROCESSING, aiQueue);
    if (billingQueue) {
      this.queues.set(QUEUE_NAMES.BILLING_PROCESSING, billingQueue);
    }
    if (ingestionQueue) {
      this.queues.set(QUEUE_NAMES.DATA_INGESTION, ingestionQueue);
      if (entitlementQueue) {
        this.queues.set(QUEUE_NAMES.ENTITLEMENT_PROCESSING, entitlementQueue);
      }
    }
  }

  private buildMetadata(): JobMetadata {
    return {
      traceId: this.cls?.get<string>(CLS_TRACE_ID) ?? undefined,
      tenantId: this.cls?.get<string>(CLS_TENANT_ID) ?? undefined,
      queuedAt: new Date().toISOString(),
    };
  }

  async enqueue<Q extends QueueName, J extends JobNameFor<Q>>(
    queueName: Q,
    jobName: J,
    data: JobDataFor<Q, J>,
    opts?: JobsOptions,
  ): Promise<Job<JobDataFor<Q, J>>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      this.logger.error(
        `Queue "${queueName}" is not registered — cannot enqueue job "${String(jobName)}"`,
      );
      throw new Error(`Queue "${queueName}" is not registered`);
    }
    const job = await queue.add(
      jobName,
      { ...data, _metadata: this.buildMetadata() },
      opts,
    );
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
      this.logger.error(
        `Queue "${queueName}" is not registered — cannot enqueue bulk jobs`,
      );
      throw new Error(`Queue "${queueName}" is not registered`);
    }
    const metadata = this.buildMetadata();
    const result = await queue.addBulk(
      jobs.map((j) => ({
        name: j.name,
        data: { ...j.data, _metadata: metadata },
        opts: j.opts,
      })),
    );
    this.logger.debug(`Enqueued ${result.length} jobs on ${queueName}`);
    return result as Job<JobDataFor<Q, J>>[];
  }
}
