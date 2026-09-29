import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CLS_TENANT_ID, CLS_TRACE_ID } from '@lib/context';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { storage } from 'nestjs-pino/storage';
import pino from 'pino';
import { AbstractProcessor } from './abstract-processor';
import { JobMetadata } from './interfaces/job-metadata.interface';

type TestJobData = { value: string; _metadata?: JobMetadata };

class TestProcessor extends AbstractProcessor<TestJobData, string> {
  protected readonly logger = new Logger(TestProcessor.name);

  handle(job: Job<TestJobData>): Promise<string> {
    return Promise.resolve(job.data.value);
  }
}

function makeJob(
  data: TestJobData,
  overrides: Partial<Job<TestJobData>> = {},
): Job<TestJobData> {
  return {
    id: 'job-1',
    name: 'test-job',
    data,
    attemptsMade: 0,
    opts: {},
    ...overrides,
  } as unknown as Job<TestJobData>;
}

describe('AbstractProcessor', () => {
  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor();
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('job context', () => {
    const rootDescriptor = Object.getOwnPropertyDescriptor(PinoLogger, 'root');

    afterEach(() => {
      if (rootDescriptor) {
        Object.defineProperty(PinoLogger, 'root', rootDescriptor);
      } else {
        delete (PinoLogger as { root?: unknown }).root;
      }
    });

    /** What handle() sees: the log bindings of the current logger and the CLS values. */
    function observingProcessor(cls?: ClsService): {
      processor: TestProcessor;
      seen: () => {
        bindings: Record<string, unknown>;
        trace?: string;
        tenant?: string;
      };
    } {
      let seen: {
        bindings: Record<string, unknown>;
        trace?: string;
        tenant?: string;
      } = {
        bindings: {},
      };
      class Observing extends TestProcessor {
        handle(job: Job<TestJobData>): Promise<string> {
          seen = {
            bindings: storage.getStore()?.logger.bindings() ?? {},
            trace: cls?.get<string>(CLS_TRACE_ID),
            tenant: cls?.get<string>(CLS_TENANT_ID),
          };
          return super.handle(job);
        }
      }
      const processor = new Observing();
      jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation(() => undefined);
      (processor as unknown as { cls?: ClsService }).cls = cls;
      return { processor, seen: () => seen };
    }

    it('runs the job with a logger bound to its trace, tenant and job, and the trace and tenant in CLS', async () => {
      Object.defineProperty(PinoLogger, 'root', {
        value: pino({ level: 'silent' }),
        configurable: true,
      });
      const cls = new ClsService(new AsyncLocalStorage());
      const { processor, seen } = observingProcessor(cls);

      await processor.process(
        makeJob(
          {
            value: 'x',
            _metadata: {
              traceId: 'trace-abc',
              tenantId: 'tenant-xyz',
              queuedAt: new Date().toISOString(),
            },
          },
          { queueName: 'data-ingestion' } as Partial<Job<TestJobData>>,
        ),
      );

      expect(seen().bindings).toMatchObject({
        trace_id: 'trace-abc',
        tenant_id: 'tenant-xyz',
        job_id: 'job-1',
        job_name: 'test-job',
        queue_name: 'data-ingestion',
      });
      expect(seen().trace).toBe('trace-abc');
      expect(seen().tenant).toBe('tenant-xyz');
    });

    it('binds the job fields when the job carries no metadata', async () => {
      Object.defineProperty(PinoLogger, 'root', {
        value: pino({ level: 'silent' }),
        configurable: true,
      });
      const { processor, seen } = observingProcessor();

      await processor.process(makeJob({ value: 'x' }));

      expect(seen().bindings).toMatchObject({
        job_id: 'job-1',
        job_name: 'test-job',
      });
      expect(seen().bindings).not.toHaveProperty('trace_id');
    });

    it('still runs the job without a pino root logger or CLS (unit contexts)', async () => {
      delete (PinoLogger as { root?: unknown }).root;
      const { processor } = observingProcessor();

      await expect(processor.process(makeJob({ value: 'ok' }))).resolves.toBe(
        'ok',
      );
    });
  });

  describe('process() execution', () => {
    it('returns the result of handle()', async () => {
      const job = makeJob({ value: 'hello' });
      const result = await processor.process(job);
      expect(result).toBe('hello');
    });
  });
});
