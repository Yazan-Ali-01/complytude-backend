import { DefaultJobOptions } from 'bullmq';

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s → 2s → 4s
  },
  removeOnComplete: {
    age: 24 * 3600, // purge completed jobs older than 24h
    count: 1000, // or keep at most 1000
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep failed jobs for 7 days for debugging
  },
};
