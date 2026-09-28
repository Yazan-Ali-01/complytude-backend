import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { JobMetadata } from './interfaces/job-metadata.interface';

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class PermanentError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PermanentError';
  }
}

export abstract class AbstractProcessor<TData = unknown, TResult = unknown>
  extends WorkerHost
  implements OnApplicationBootstrap
{
  protected abstract readonly logger: Logger;

  @Optional()
  @Inject(PinoLogger)
  protected readonly pinoLogger?: PinoLogger;

  abstract handle(job: Job<TData>): Promise<TResult>;

  /**
   * How many jobs this worker runs at once. BullMQ's default is 1, so one slow job (a long
   * Textract poll, an LLM call) holds up every tenant behind it. Override to read the worker's
   * configured concurrency.
   */
  protected workerConcurrency(): number | undefined {
    return undefined;
  }

  /** The BullMQ worker exists once every module has initialised; apply the concurrency then. */
  onApplicationBootstrap(): void {
    const concurrency = this.workerConcurrency();
    if (concurrency && concurrency > 0) {
      this.worker.concurrency = concurrency;
      this.logger.log(`Worker concurrency set to ${concurrency}`);
    }
  }

  async process(job: Job<TData>): Promise<TResult> {
    const startTime = Date.now();
    const queueName = job.queueName;
    const meta = {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    };

    const metadata = (job.data as Record<string, unknown>)?._metadata as
      | JobMetadata
      | undefined;

    if (this.pinoLogger) {
      try {
        const logContext: Record<string, string> = {};
        if (metadata?.traceId) logContext.trace_id = metadata.traceId;
        if (metadata?.tenantId) logContext.tenant_id = metadata.tenantId;
        logContext.queue_name = queueName;
        if (job.id) logContext.job_id = job.id;
        logContext.job_name = job.name;
        this.pinoLogger.assign(logContext);
      } catch {
        // PinoLogger.assign throws outside HTTP request scope (e.g. BullMQ workers).
        // Skip metadata assignment; Nest Logger still works.
      }
    }

    this.logger.log(
      `Job started [${meta.jobName}] id=${meta.jobId} attempt=${meta.attempt}`,
    );

    this.logJobPayloadSummary(job);

    try {
      const result = await this.handle(job);
      const elapsedMs = Date.now() - startTime;
      this.logger.log(
        `Job completed [${meta.jobName}] id=${meta.jobId} elapsed=${elapsedMs}ms`,
      );
      return result;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;

      if (error instanceof PermanentError) {
        this.logger.error(
          `Job failed permanently [${meta.jobName}] id=${meta.jobId} elapsed=${elapsedMs}ms: ${error.message}`,
          error.cause?.stack,
        );
        await this.onPermanentFailure(job, error);
        // UnrecoverableError tells BullMQ to skip retries and move directly to failed
        throw new UnrecoverableError(error.message);
      }

      this.logger.warn(
        `Job failed (retryable) [${meta.jobName}] id=${meta.jobId} attempt=${meta.attempt} elapsed=${elapsedMs}ms: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<TData> | undefined, error: Error) {
    if (!job) return;
    if (job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      this.logger.error(
        `Job exhausted all retries [${job.name}] id=${job.id} attempts=${job.attemptsMade}: ${error.message}`,
      );
      this.onDeadLetter(job, error);
    }
  }

  private logJobPayloadSummary(job: Job<TData>): void {
    try {
      const data = { ...(job.data as Record<string, unknown>) };
      delete data._metadata;
      const keys = Object.keys(data);
      if (keys.length > 0) {
        this.logger.debug(
          `Job payload [${job.name}] id=${job.id} keys=[${keys.join(',')}]`,
        );
      }
    } catch {
      // Never fail on debug logging
    }
  }

  protected async onPermanentFailure(
    _job: Job<TData>,
    _error: PermanentError,
  ): Promise<void> {
    // Override in subclass for custom permanent failure handling (e.g., alert, metric)
  }

  protected onDeadLetter(_job: Job<TData>, _error: Error): void {
    // Override in subclass for custom DLQ handling (e.g., enqueue to DLQ, alert)
    this.logger.error(`Job moved to dead letter [${_job.name}] id=${_job.id}`);
  }
}
