import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'complytude:',
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    // Exponential backoff: 50ms, 100ms, 200ms, 400ms, max 2s
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableReadyCheck: true,
  connectTimeout: 10000, // 10 seconds
  lazyConnect: false, // Connect immediately on startup
}));
