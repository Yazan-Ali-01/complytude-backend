/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
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

function makePinoLogger(): jest.Mocked<PinoLogger> {
  return { assign: jest.fn() } as unknown as jest.Mocked<PinoLogger>;
}

describe('AbstractProcessor', () => {
  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor();
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
  });

  describe('metadata extraction', () => {
    it('assigns trace_id and tenant_id when job has full _metadata', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;

      const job = makeJob({
        value: 'test',
        _metadata: {
          traceId: 'trace-abc',
          tenantId: 'tenant-xyz',
          queuedAt: new Date().toISOString(),
        },
      });

      await processor.process(job);

      expect(pinoLogger.assign).toHaveBeenCalledTimes(1);
      expect(pinoLogger.assign).toHaveBeenCalledWith({
        trace_id: 'trace-abc',
        tenant_id: 'tenant-xyz',
      });
    });

    it('assigns only trace_id when tenantId is absent in _metadata', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;

      const job = makeJob({
        value: 'test',
        _metadata: {
          traceId: 'trace-only',
          queuedAt: new Date().toISOString(),
        },
      });

      await processor.process(job);

      expect(pinoLogger.assign).toHaveBeenCalledWith({
        trace_id: 'trace-only',
      });
    });

    it('assigns only tenant_id when traceId is absent in _metadata', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;

      const job = makeJob({
        value: 'test',
        _metadata: {
          tenantId: 'tenant-only',
          queuedAt: new Date().toISOString(),
        },
      });

      await processor.process(job);

      expect(pinoLogger.assign).toHaveBeenCalledWith({
        tenant_id: 'tenant-only',
      });
    });

    it('does not call assign when _metadata is present but both ids are absent', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;

      const job = makeJob({
        value: 'test',
        _metadata: { queuedAt: new Date().toISOString() },
      });

      await processor.process(job);

      expect(pinoLogger.assign).not.toHaveBeenCalled();
    });

    it('does not call assign and does not throw when job has no _metadata', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;

      const job = makeJob({ value: 'test' });

      await expect(processor.process(job)).resolves.toBe('test');
      expect(pinoLogger.assign).not.toHaveBeenCalled();
    });

    it('does not throw when PinoLogger is not injected and _metadata is present', async () => {
      const job = makeJob({
        value: 'test',
        _metadata: {
          traceId: 'trace-abc',
          tenantId: 'tenant-xyz',
          queuedAt: new Date().toISOString(),
        },
      });

      await expect(processor.process(job)).resolves.toBe('test');
    });

    it('does not throw when PinoLogger is not injected and _metadata is absent', async () => {
      const job = makeJob({ value: 'test' });
      await expect(processor.process(job)).resolves.toBe('test');
    });
  });

  describe('process() execution', () => {
    it('returns the result of handle()', async () => {
      const job = makeJob({ value: 'hello' });
      const result = await processor.process(job);
      expect(result).toBe('hello');
    });

    it('assigns logger context before calling handle()', async () => {
      const pinoLogger = makePinoLogger();
      (processor as any).pinoLogger = pinoLogger;
      const callOrder: string[] = [];

      pinoLogger.assign.mockImplementation(() => {
        callOrder.push('assign');
        return undefined as any;
      });
      jest.spyOn(processor, 'handle').mockImplementation(() => {
        callOrder.push('handle');
        return Promise.resolve('done');
      });

      const job = makeJob({
        value: 'test',
        _metadata: { traceId: 'trace-abc', queuedAt: new Date().toISOString() },
      });

      await processor.process(job);
      expect(callOrder).toEqual(['assign', 'handle']);
    });
  });
});
