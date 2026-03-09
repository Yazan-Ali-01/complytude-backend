import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';
import { JobDataFor, JobNameFor, QueueName } from './queue-job-map';
import { QUEUE_NAMES } from './queue.constants';

@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING)
    private readonly aiQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BILLING_PROCESSING)
    private readonly billingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DATA_INGESTION)
    private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ENTITLEMENT_PROCESSING)
    private readonly entitlementQueue: Queue,
  ) {
    this.queues.set(QUEUE_NAMES.AI_PROCESSING, this.aiQueue);
    this.queues.set(QUEUE_NAMES.BILLING_PROCESSING, this.billingQueue);
    this.queues.set(QUEUE_NAMES.DATA_INGESTION, this.ingestionQueue);
    this.queues.set(QUEUE_NAMES.ENTITLEMENT_PROCESSING, this.entitlementQueue);
  }

  async enqueue<Q extends QueueName, J extends JobNameFor<Q>>(
    queueName: Q,
    jobName: J,
    data: JobDataFor<Q, J>,
    opts?: JobsOptions,
  ): Promise<Job<JobDataFor<Q, J>>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" is not registered`);
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
      throw new Error(`Queue "${queueName}" is not registered`);
    }
    const result = await queue.addBulk(
      jobs.map((j) => ({ name: j.name, data: j.data, opts: j.opts })),
    );
    this.logger.debug(`Enqueued ${result.length} jobs on ${queueName}`);
    return result as Job<JobDataFor<Q, J>>[];
  }
}
