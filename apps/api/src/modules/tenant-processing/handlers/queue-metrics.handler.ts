import {
  getQueueToken,
  QUEUE_NAMES,
  type Job,
  type Queue,
  type TenantQueueMetricsJobData,
} from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** How often the job runs, and so the window "failed in the last interval" counts. */
export const QUEUE_METRICS_INTERVAL_SECONDS = 60;

/** Failed jobs looked at per queue (newest first); more than this in a minute is an alarm anyway. */
const RECENT_FAILED_SAMPLE = 100;

export interface QueueMetrics {
  metric: 'queue_depth';
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  /** Age of the oldest job still waiting, 0 when none: a consumer that stopped shows as growth. */
  oldestWaitingSeconds: number;
  failedLastInterval: number;
}

/**
 * Logs one JSON line per queue. CloudWatch metric filters turn the fields into metrics
 * (`metric = "queue_depth"`, dimension `queue`), which the backlog, stuck-job and failure alarms
 * watch (infra/modules/monitoring).
 */
@Injectable()
export class QueueMetricsHandler {
  private readonly logger = new Logger(QueueMetricsHandler.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async execute(
    _job?: Job<TenantQueueMetricsJobData>,
  ): Promise<QueueMetrics[]> {
    const now = Date.now();
    const metrics = await Promise.all(
      Object.values(QUEUE_NAMES).map((name) =>
        this.measure(
          this.moduleRef.get<Queue>(getQueueToken(name), { strict: false }),
          name,
          now,
        ),
      ),
    );
    for (const entry of metrics) {
      this.logger.log(entry);
    }
    return metrics;
  }

  private async measure(
    queue: Queue,
    name: string,
    now: number,
  ): Promise<QueueMetrics> {
    const [waiting, active, delayed, oldest, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getWaiting(0, 0),
      queue.getFailed(0, RECENT_FAILED_SAMPLE - 1),
    ]);
    const since = now - QUEUE_METRICS_INTERVAL_SECONDS * 1000;
    return {
      metric: 'queue_depth',
      queue: name,
      waiting,
      active,
      delayed,
      oldestWaitingSeconds: oldest[0]
        ? Math.max(0, Math.round((now - oldest[0].timestamp) / 1000))
        : 0,
      failedLastInterval: failed.filter((job) => (job.finishedOn ?? 0) >= since)
        .length,
    };
  }
}
