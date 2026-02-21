import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { DEFAULT_JOB_OPTIONS } from './queue.config';

@Global()
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static forRoot(queues: string[]): DynamicModule {
    const bullRootModule = BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string>('redis.password');
        const db = configService.get<number>('redis.db');

        // BullMQ requires maxRetriesPerRequest: null — it uses blocking
        // commands (BLPOP) that are incompatible with a finite retry limit
        const connection = new IORedis({
          host,
          port,
          password,
          db,
          maxRetriesPerRequest: null,
          retryStrategy: (times) => {
            if (times > 3) {
              QueueModule.logger.error(
                'BullMQ Redis connection failed after 3 retries',
              );
              return null;
            }
            const delay = Math.min(times * 100, 2000);
            QueueModule.logger.warn(
              `BullMQ Redis connection attempt ${times}, retrying in ${delay}ms...`,
            );
            return delay;
          },
        });

        connection.on('connect', () => {
          QueueModule.logger.log(
            'BullMQ Redis connection established successfully',
          );
        });

        connection.on('ready', () => {
          QueueModule.logger.log(
            'BullMQ Redis client is ready to accept commands',
          );
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

        return {
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        };
      },
      inject: [ConfigService],
    });

    const bullQueuesModule = BullModule.registerQueue(
      ...queues.map((name) => ({ name })),
    );

    return {
      module: QueueModule,
      imports: [bullRootModule, bullQueuesModule],
      exports: [BullModule],
    };
  }
}
