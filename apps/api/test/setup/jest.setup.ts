import path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

const TEST_CONFIG_PATH = '/tmp/complytude-test-config.json';

// Load .env.test first (dotenv does not override existing process.env)
config({ path: path.resolve(__dirname, '../../.env.test') });

// Override with testcontainer config (written by globalSetup)
const configJson = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
const testConfig = JSON.parse(configJson) as {
  postgres: { host: string; port: number; user: string; password: string };
  redis: { host: string; port: number };
};

const workerId = parseInt(process.env.JEST_WORKER_ID ?? '1', 10);

process.env.DB_HOST = testConfig.postgres.host;
process.env.DB_PORT = String(testConfig.postgres.port);
process.env.DB_APP_USER = testConfig.postgres.user;
process.env.DB_APP_PASSWORD = testConfig.postgres.password;
process.env.DB_NAME = `test_w${workerId}`;

process.env.REDIS_HOST = testConfig.redis.host;
process.env.REDIS_PORT = String(testConfig.redis.port);
// Use same Redis DB for cache and queue so one FLUSHDB clears both (required for resetTestState)
const redisDb = (workerId - 1) * 2;
process.env.REDIS_DB = String(redisDb);
process.env.REDIS_QUEUE_DB = String(redisDb);

// ensureWorkerDatabase() is called from createTestApp() — Jest setupFiles run sync, can't await
