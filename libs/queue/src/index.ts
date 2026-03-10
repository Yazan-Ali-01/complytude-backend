export * from './queue.constants';
export * from './queue.config';
export * from './queue.module';
export * from './queue-job-map';
export * from './queue-producer.service';
export * from './abstract-processor';
export * from './interfaces';

// Re-export for processors and tests in apps (avoids no-restricted-imports)
export { Processor, getQueueToken } from '@nestjs/bullmq';
export type { Job, Queue } from 'bullmq';
