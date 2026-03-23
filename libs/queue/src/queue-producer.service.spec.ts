import { CLS_TENANT_ID, CLS_TRACE_ID } from '@lib/context';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { DocumentAnalysisJobData } from './interfaces/ai-processing.jobs';
import { JobMetadata } from './interfaces/job-metadata.interface';
import { QueueProducerService } from './queue-producer.service';
import { QUEUE_NAMES } from './queue.constants';

const AI_QUEUE_TOKEN = getQueueToken(QUEUE_NAMES.AI_PROCESSING);

type MockQueue = Pick<Queue, 'add' | 'addBulk'>;

function makeQueue(): MockQueue {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    addBulk: jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]),
  };
}

function makeCls(traceId?: string, tenantId?: string): jest.Mocked<ClsService> {
  return {
    get: jest.fn((key: string) => {
      if (key === CLS_TRACE_ID) return traceId;
      if (key === CLS_TENANT_ID) return tenantId;
      return undefined;
    }),
  } as unknown as jest.Mocked<ClsService>;
}

function makeService(
  queue: MockQueue | null,
  cls: ClsService | null,
): QueueProducerService {
  return new QueueProducerService(
    queue as unknown as Queue,
    null,
    null,
    null,
    cls,
  );
}

describe('QueueProducerService', () => {
  const jobData: DocumentAnalysisJobData = {
    analysisJobId: 'analysis-1',
    documentId: 'doc-1',
    tenantId: 'tenant-1',
  };

  describe('enqueue()', () => {
    it('injects _metadata with traceId, tenantId and queuedAt when CLS is populated', async () => {
      const queue = makeQueue();
      const service = makeService(queue, makeCls('trace-abc', 'tenant-xyz'));

      await service.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        'document-analysis',
        jobData,
      );

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [, calledData] = (queue.add as jest.Mock).mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const metadata = calledData._metadata as JobMetadata;
      expect(metadata.traceId).toBe('trace-abc');
      expect(metadata.tenantId).toBe('tenant-xyz');
      expect(typeof metadata.queuedAt).toBe('string');
      expect(new Date(metadata.queuedAt).toISOString()).toBe(metadata.queuedAt);
    });

    it('injects _metadata with only queuedAt when CLS values are empty', async () => {
      const queue = makeQueue();
      const service = makeService(queue, makeCls(undefined, undefined));

      await service.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        'document-analysis',
        jobData,
      );

      const [, calledData] = (queue.add as jest.Mock).mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const metadata = calledData._metadata as JobMetadata;
      expect(metadata.traceId).toBeUndefined();
      expect(metadata.tenantId).toBeUndefined();
      expect(typeof metadata.queuedAt).toBe('string');
    });

    it('injects _metadata with only queuedAt when ClsService is not injected (null)', async () => {
      const queue = makeQueue();
      const service = makeService(queue, null);

      await service.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        'document-analysis',
        jobData,
      );

      const [, calledData] = (queue.add as jest.Mock).mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const metadata = calledData._metadata as JobMetadata;
      expect(metadata.traceId).toBeUndefined();
      expect(metadata.tenantId).toBeUndefined();
      expect(typeof metadata.queuedAt).toBe('string');
    });

    it('throws when queue is not registered', async () => {
      const service = makeService(null, null);
      await expect(
        service.enqueue(
          QUEUE_NAMES.AI_PROCESSING,
          'document-analysis',
          jobData,
        ),
      ).rejects.toThrow(
        `Queue "${QUEUE_NAMES.AI_PROCESSING}" is not registered`,
      );
    });

    it('preserves original job data alongside _metadata', async () => {
      const queue = makeQueue();
      const service = makeService(queue, null);

      await service.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        'document-analysis',
        jobData,
      );

      const [, calledData] = (queue.add as jest.Mock).mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(calledData.documentId).toBe('doc-1');
      expect(calledData.tenantId).toBe('tenant-1');
      expect(calledData._metadata).toBeDefined();
    });
  });

  describe('enqueueBulk()', () => {
    it('injects _metadata into each job', async () => {
      const queue = makeQueue();
      const service = makeService(queue, makeCls('trace-bulk', 'tenant-bulk'));

      await service.enqueueBulk(QUEUE_NAMES.AI_PROCESSING, [
        { name: 'document-analysis', data: jobData },
        {
          name: 'document-analysis',
          data: { ...jobData, documentId: 'doc-2' },
        },
      ]);

      const [[bulkJobs]] = (queue.addBulk as jest.Mock).mock.calls as [
        [Array<{ name: string; data: Record<string, unknown> }>],
      ];
      expect(bulkJobs).toHaveLength(2);

      for (const job of bulkJobs) {
        const metadata = job.data._metadata as JobMetadata;
        expect(metadata.traceId).toBe('trace-bulk');
        expect(metadata.tenantId).toBe('tenant-bulk');
        expect(typeof metadata.queuedAt).toBe('string');
      }
    });

    it('all bulk jobs share the same queuedAt snapshot', async () => {
      const queue = makeQueue();
      const service = makeService(queue, null);

      await service.enqueueBulk(QUEUE_NAMES.AI_PROCESSING, [
        { name: 'document-analysis', data: jobData },
        { name: 'document-analysis', data: jobData },
      ]);

      const [[bulkJobs]] = (queue.addBulk as jest.Mock).mock.calls as [
        [Array<{ name: string; data: Record<string, unknown> }>],
      ];
      const [first, second] = bulkJobs.map(
        (j) => (j.data._metadata as JobMetadata).queuedAt,
      );
      expect(first).toBe(second);
    });

    it('throws when queue is not registered', async () => {
      const service = makeService(null, null);
      await expect(
        service.enqueueBulk(QUEUE_NAMES.AI_PROCESSING, [
          { name: 'document-analysis', data: jobData },
        ]),
      ).rejects.toThrow(
        `Queue "${QUEUE_NAMES.AI_PROCESSING}" is not registered`,
      );
    });
  });

  describe('queue token injection key', () => {
    it('registers the correct queue under AI_QUEUE_TOKEN', async () => {
      const aiQueue = makeQueue();
      const service = makeService(aiQueue, null);

      await service.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        'document-analysis',
        jobData,
      );
      expect(aiQueue.add).toHaveBeenCalledTimes(1);
    });
  });
});

// suppress unused import warning
void AI_QUEUE_TOKEN;
