export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: number;
  retryDelayMs: number;
  connectTimeout: number;
  keyPrefix: string;
}
