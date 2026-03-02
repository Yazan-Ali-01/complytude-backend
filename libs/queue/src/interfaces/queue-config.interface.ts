export interface QueueRedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: Record<string, unknown>;
  retryDelayMs?: number;
}
