import { BullModule } from '@nestjs/bullmq';
import {
  DynamicModule,
  Global,
  InjectionToken,
  Logger,
  Module,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { reconnectOptions } from '@lib/redis/redis-connection';
import IORedis from 'ioredis';
import { QueueRedisConfig } from './interfaces/queue-config.interface';
import { QueueProducerService } from './queue-producer.service';
import { DEFAULT_JOB_OPTIONS } from './queue.config';

export interface QueueModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  queues: string[];
  useFactory: (
    ...args: unknown[]
  ) => QueueRedisConfig | Promise<QueueRedisConfig>;
  inject?: InjectionToken[] | OptionalFactoryDependency[];
}

@Global()
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static forRoot(queues: string[]): DynamicModule {
    return QueueModule.forRootAsync({
      queues,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): QueueRedisConfig => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string>('redis.password');
        const db = configService.get<number>('redis.queueDb');
        const tls = configService.get<Record<string, unknown>>('redis.tls');

        if (!host || !port) {
          throw new Error(
            'Redis configuration not found. Make sure redisConfig is loaded in ConfigModule.',
          );
        }

        return { host, port, password, db, tls };
      },
    });
  }

  /** The BullMQ connection, with the reconnect policy (public so tests can target a proxy). */
  static createConnection(config: QueueRedisConfig): IORedis {
    const retryDelayMs = config.retryDelayMs ?? 100;

    // BullMQ requires maxRetriesPerRequest: null — it uses blocking
    // commands (BLPOP) that are incompatible with a finite retry limit
    const connection = new IORedis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      tls: config.tls,
      // Prevents CLIENT SETINFO from being queued on connect; avoids "Connection is closed"
      // during graceful shutdown when quit() runs with pending commands (ioredis #2025)
      disableClientInfo: true,
      maxRetriesPerRequest: null,
      ...reconnectOptions(QueueModule.logger, 'BullMQ Redis', retryDelayMs),
    });

    connection.on('connect', () => {
      QueueModule.logger.log(
        'BullMQ Redis connection established successfully',
      );
    });

    connection.on('ready', () => {
      QueueModule.logger.log('BullMQ Redis client is ready to accept commands');
    });

    connection.on('error', (error: Error) => {
      QueueModule.logger.error('BullMQ Redis client error:', error.message);
    });

    connection.on('close', () => {
      QueueModule.logger.warn('BullMQ Redis connection closed');
    });

    connection.on('reconnecting', () => {
      QueueModule.logger.log('BullMQ Redis client reconnecting...');
    });

    return connection;
  }

  static forRootAsync(options: QueueModuleAsyncOptions): DynamicModule {
    const bullRootModule = BullModule.forRootAsync({
      imports: options.imports ?? [],
      useFactory: async (...args: unknown[]) => {
        const config = await options.useFactory(...args);

        QueueModule.logger.log(
          `Creating BullMQ Redis connection: ${config.host}:${config.port}/${config.db ?? 0}`,
        );

        return {
          connection: QueueModule.createConnection(config),
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        };
      },
      inject: options.inject ?? [],
    });

    const bullQueuesModule = BullModule.registerQueue(
      ...options.queues.map((name) => ({ name })),
    );

    return {
      module: QueueModule,
      imports: [bullRootModule, bullQueuesModule],
      providers: [QueueProducerService],
      exports: [BullModule, QueueProducerService],
    };
  }
}
