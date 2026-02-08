import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!, 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB!, 10),

  // TLS for production
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,

  // Connection settings
  maxRetriesPerRequest: 3,
  retryDelayMs: 100,
  connectTimeout: 10000,

  // Key prefix for namespace isolation
  keyPrefix: process.env.REDIS_KEY_PREFIX,
}));
