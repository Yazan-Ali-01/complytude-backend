import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!, 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB!, 10),
  queueDb: parseInt(process.env.REDIS_QUEUE_DB!, 10),

  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,

  maxRetriesPerRequest: 3,
  retryDelayMs: 100,
  connectTimeout: 10000,

  keyPrefix: process.env.REDIS_KEY_PREFIX,
}));
