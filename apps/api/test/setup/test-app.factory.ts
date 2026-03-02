import { DatabaseService } from '@lib/database';
import { REDIS_CLIENT } from '@lib/redis/redis.constants';
import { RedisService } from '@lib/redis';
import { QUEUE_NAMES, QueueProducerService } from '@lib/queue';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import Redis from 'ioredis';
import { INestApplication } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { StorageService } from 'src/modules/storage/storage.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { MockStorageService } from '../mocks/storage.mock';
import { ensureWorkerDatabase } from './worker-database.setup';

const noOpAuditService = {
  log: async (): Promise<void> => {},
  getAuditLogs: async (): Promise<unknown> => [],
  getUserAuditLogs: async (): Promise<unknown> => [],
  countAuditLogs: async (): Promise<number> => 0,
};

export interface TestApp {
  app: INestApplication;
  module: TestingModule;
  databaseService: DatabaseService;
  redisService: RedisService;
  redisClient: Redis;
  queueProducerService: QueueProducerService;
  cleanup: () => Promise<void>;
}

export interface CreateTestAppOptions {
  providers?: Array<{
    provide: unknown;
    useValue?: unknown;
    useClass?: new (...args: unknown[]) => unknown;
    useFactory?: (...args: unknown[]) => unknown;
  }>;
}

export async function createTestApp(
  options?: CreateTestAppOptions,
): Promise<TestApp> {
  const start = performance.now();

  await ensureWorkerDatabase();

  const builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StorageService)
    .useClass(MockStorageService)
    .overrideProvider(AuditService)
    .useValue(noOpAuditService);

  for (const override of options?.providers ?? []) {
    if (override.useValue !== undefined) {
      builder.overrideProvider(override.provide).useValue(override.useValue);
    } else if (override.useClass !== undefined) {
      builder.overrideProvider(override.provide).useClass(override.useClass);
    } else if (override.useFactory !== undefined) {
      builder.overrideProvider(override.provide).useFactory({
        factory: override.useFactory,
        inject: [],
      });
    }
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();

  const databaseService = moduleRef.get(DatabaseService);
  const redisService = moduleRef.get(RedisService);
  const redisClient = moduleRef.get<Redis>(REDIS_CLIENT);
  const queueProducerService = moduleRef.get(QueueProducerService);

  const elapsed = Math.round(performance.now() - start);
  console.log(`createTestApp() took ${elapsed}ms`);

  return {
    app,
    module: moduleRef,
    databaseService,
    redisService,
    redisClient,
    queueProducerService,
    cleanup: async () => {
      // Explicitly close BullMQ queues and disconnect before app.close() to reduce shutdown race
      // (BullMQ #3546 — use disconnect() instead of quit() to avoid "Connection is closed" errors)
      const queueNames = [
        QUEUE_NAMES.AI_PROCESSING,
        QUEUE_NAMES.DATA_INGESTION,
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      ];
      const queues = queueNames.map((name) =>
        moduleRef.get<Queue>(getQueueToken(name)),
      );
      const bullConnection = (queues[0] as Queue & { connection: Redis })
        .connection;
      await Promise.all(queues.map((q) => q.close().catch(() => {})));
      bullConnection.disconnect();
      await new Promise((r) => setTimeout(r, 150));
      await app.close();
    },
  };
}
