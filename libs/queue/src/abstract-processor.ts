import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { CLS_TENANT_ID, CLS_TRACE_ID } from '@lib/context';
import { Job, UnrecoverableError } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { storage, Store } from 'nestjs-pino/storage';
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
  @Inject(ClsService)
  protected readonly cls?: ClsService;

  abstract handle(job: Job<TData>): Promise<TResult>;

  /**
   * How many jobs this worker runs at once. BullMQ's default is 1, so one slow job (a long
   * OCR poll, an LLM call) holds up every tenant behind it. Override to read the worker's
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

  /**
   * Runs the job in the context of the request that queued it: every log line carries its
   * trace_id, tenant_id and job fields, and the trace and tenant are in CLS, so anything the job
   * queues or audits keeps them.
   */
  async process(job: Job<TData>): Promise<TResult> {
    const metadata = (job.data as Record<string, unknown>)?._metadata as
      | JobMetadata
      | undefined;
    const bindings: Record<string, string> = {
      queue_name: job.queueName,
      job_name: job.name,
    };
    if (job.id) bindings.job_id = job.id;
    if (metadata?.traceId) bindings.trace_id = metadata.traceId;
    if (metadata?.tenantId) bindings.tenant_id = metadata.tenantId;

    // PinoLogger.root exists once the pino LoggerModule is up; the Nest Logger reads this store
    const root = (PinoLogger as { root?: PinoLogger['logger'] }).root;
    const withLogger = (): Promise<TResult> =>
      root
        ? storage.run(new Store(root.child(bindings)), () => this.run(job))
        : this.run(job);

    const cls = this.cls;
    if (!cls) return withLogger();
    return cls.run(() => {
      if (metadata?.traceId) cls.set(CLS_TRACE_ID, metadata.traceId);
      if (metadata?.tenantId) cls.set(CLS_TENANT_ID, metadata.tenantId);
      return withLogger();
    });
  }

  private async run(job: Job<TData>): Promise<TResult> {
    const startTime = Date.now();
    const meta = {
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    };

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
