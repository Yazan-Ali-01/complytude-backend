import {
  AbstractProcessor,
  checkWorkerHealth,
  getQueueToken,
  Processor,
  QueueModule,
  type Job,
  type Queue,
} from '@lib/queue';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const QUEUE = 'test-processor-concurrency';

/** One job blocks until released; the others finish at once. */
let releaseSlowJob: () => void = () => undefined;
const finished: string[] = [];

@Processor(QUEUE)
class SlowJobProcessor extends AbstractProcessor<{ slow?: boolean }, void> {
  protected readonly logger = new Logger(SlowJobProcessor.name);

  protected override workerConcurrency(): number {
    return 3;
  }

  async handle(job: Job<{ slow?: boolean }>): Promise<void> {
    if (job.data.slow) {
      await new Promise<void>((resolve) => {
        releaseSlowJob = resolve;
      });
    }
    finished.push(job.name);
  }
}

/**
 * Workers run as many jobs at once as they are configured to (AbstractProcessor applies
 * workerConcurrency() to the BullMQ worker), so one slow job doesn't hold up the others; and
 * their health check reflects whether the worker actually runs.
 */
describe('Processor concurrency', () => {
  let moduleRef: TestingModule;
  let queue: Queue;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        QueueModule.forRootAsync({
          queues: [QUEUE],
          useFactory: () => ({
            host: process.env.REDIS_HOST!,
            port: Number(process.env.REDIS_PORT),
            db: Number(process.env.REDIS_QUEUE_DB ?? 1),
          }),
        }),
      ],
      providers: [SlowJobProcessor],
    }).compile();
    await moduleRef.init();
    queue = moduleRef.get<Queue>(getQueueToken(QUEUE));
    await queue.obliterate({ force: true });
  }, 30000);

  afterAll(async () => {
    releaseSlowJob();
    await queue?.obliterate({ force: true });
    await moduleRef?.close();
  }, 30000);

  it('finishes other jobs while a slow one is still running', async () => {
    expect(moduleRef.get(SlowJobProcessor).worker.concurrency).toBe(3);

    await queue.add('slow', { slow: true });
    await queue.add('quick-1', {});
    await queue.add('quick-2', {});

    const deadline = Date.now() + 10_000;
    while (finished.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(finished.sort()).toEqual(['quick-1', 'quick-2']);
    expect(await queue.getActiveCount()).toBe(1);

    releaseSlowJob();
  }, 20000);

  it('reports health from the worker and its Redis connection', async () => {
    const processor = moduleRef.get(SlowJobProcessor);
    expect(await checkWorkerHealth(processor)).toEqual({
      status: 'ok',
      running: true,
      redis: true,
    });

    releaseSlowJob();
    await processor.worker.close();

    expect(await checkWorkerHealth(processor)).toMatchObject({
      status: 'unhealthy',
      running: false,
    });
  }, 20000);
});
