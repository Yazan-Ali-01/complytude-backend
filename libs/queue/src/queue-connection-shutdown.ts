import { getSharedConfigToken } from '@nestjs/bullmq';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type IORedis from 'ioredis';

/**
 * Closes this app's shared BullMQ connection on shutdown. BullMQ never closes a connection it was
 * given, and it reconnects forever, so without this a closed app would keep its process alive.
 * The connection comes from this app's own BullMQ config, so closing one app never touches
 * another app's connection in the same process (tests run several).
 */
@Injectable()
export class QueueConnectionShutdown implements OnApplicationShutdown {
  constructor(
    @Inject(getSharedConfigToken())
    private readonly config: { connection?: IORedis },
  ) {}

  async onApplicationShutdown(): Promise<void> {
    const connection = this.config.connection;
    if (!connection || connection.status === 'end') return;
    await connection.quit().catch(() => connection.disconnect());
  }
}
