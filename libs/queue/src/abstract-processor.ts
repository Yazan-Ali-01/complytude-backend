import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';

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

export abstract class AbstractProcessor<
  TData = unknown,
  TResult = unknown,
> extends WorkerHost {
  protected abstract readonly logger: Logger;

  abstract handle(job: Job<TData>): Promise<TResult>;

  async process(job: Job<TData>): Promise<TResult> {
    const startTime = Date.now();
    const meta = {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    };

    this.logger.log(
      `Job started [${meta.jobName}] id=${meta.jobId} attempt=${meta.attempt}`,
    );

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
