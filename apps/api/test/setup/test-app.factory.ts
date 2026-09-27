import cookie from '@fastify/cookie';
import { AuditService } from '@lib/audit';
import { DatabaseService } from '@lib/database';
import type { Queue } from '@lib/queue';
import { QUEUE_NAMES, QueueProducerService, getQueueToken } from '@lib/queue';
import { RedisService } from '@lib/redis';
import { REDIS_CLIENT } from '@lib/redis/redis.constants';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { AppModule } from 'src/app.module';
import { validationExceptionFactory } from 'src/common/pipes/validation-exception.factory';
import { StorageService } from 'src/modules/storage/storage.service';
import { MockStorageService } from '../mocks/storage.mock';
import { ensureWorkerDatabase } from './worker-database.setup';

class MockAuditService {
  log(): Promise<void> {
    return Promise.resolve();
  }
  logBatch(): Promise<void> {
    return Promise.resolve();
  }
  logSystemEvent(): Promise<void> {
    return Promise.resolve();
  }
  getAuditLogs(): Promise<unknown[]> {
    return Promise.resolve([]);
  }
  getActorAuditLogs(): Promise<unknown[]> {
    return Promise.resolve([]);
  }
  countAuditLogs(): Promise<number> {
    return Promise.resolve(0);
  }
}

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
    .useClass(MockAuditService);

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

  await app.register(cookie);

  const apiPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: validationExceptionFactory,
    }),
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
      const queueNames = [
        QUEUE_NAMES.AI_PROCESSING,
        QUEUE_NAMES.DATA_INGESTION,
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      ];
      const queues = queueNames.map((name) =>
        moduleRef.get<Queue>(getQueueToken(name)),
      );

      // Grab the shared BullMQ Redis connection before closing queues
      const sharedConnection = await queues[0].client;

      await Promise.all(queues.map((q) => q.close().catch(() => {})));

      // Force-disconnect prevents ioredis retryStrategy from firing,
      // which would keep the event loop alive and block Jest exit
      sharedConnection.disconnect();

      await app.close();
    },
  };
}
