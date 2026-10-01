import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!, 10),
  name: process.env.DB_NAME!,
  user: process.env.DB_APP_USER!,
  password: process.env.DB_APP_PASSWORD!,
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS!, 10),
  // Set only in the API (databasePlatformEnvSchema)
  platformUser: process.env.DB_PLATFORM_USER || undefined,
  platformPassword: process.env.DB_PLATFORM_PASSWORD || undefined,
  platformMaxConnections: parseInt(
    process.env.DB_PLATFORM_MAX_CONNECTIONS!,
    10,
  ),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT!, 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT!, 10),
  sslEnabled:
    process.env.DB_SSL_ENABLED === 'true' || process.env.DB_SSL_ENABLED === '1',
  sslRejectUnauthorized:
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' &&
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== '0',
  sslCaPath: process.env.DB_SSL_CA_PATH || undefined,
  statementTimeoutMs: parseInt(process.env.DB_STATEMENT_TIMEOUT!, 10),
  idleInTransactionTimeoutMs: parseInt(
    process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT!,
    10,
  ),
}));
