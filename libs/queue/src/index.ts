export * from './queue.constants';
export * from './queue.config';
export * from './queue.module';
export * from './queue-job-map';
export * from './queue-producer.service';
export * from './abstract-processor';
export * from './interfaces';

// Re-export for processors in apps (avoids no-restricted-imports)
export { Processor } from '@nestjs/bullmq';
export type { Job } from 'bullmq';
