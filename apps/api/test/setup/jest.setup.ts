import path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

// Load .env.test first (dotenv does not override existing process.env)
config({ path: path.resolve(__dirname, '../../.env.test') });

// Override with testcontainer config (written by globalSetup)
let configJson: string;
try {
  configJson = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
} catch {
  throw new Error(
    `Test config not found at ${TEST_CONFIG_PATH}. Did globalSetup complete successfully? Ensure Docker is running.`,
  );
}
const testConfig: TestContainerConfig = JSON.parse(configJson);

const workerId = parseInt(process.env.JEST_WORKER_ID ?? '1', 10);

process.env.DB_HOST = testConfig.postgres.host;
process.env.DB_PORT = String(testConfig.postgres.port);
process.env.DB_APP_USER = testConfig.postgres.user;
process.env.DB_APP_PASSWORD = testConfig.postgres.password;
process.env.DB_NAME = `test_w${workerId}`;

process.env.REDIS_HOST = testConfig.redis.host;
process.env.REDIS_PORT = String(testConfig.redis.port);
// One Redis DB per worker. Cache and queue share the same DB so FLUSHDB clears both (resetTestState).
// Redis default is 16 DBs (0-15) — jest.config.ts caps integration maxWorkers at 16.
const redisDb = workerId - 1;
if (redisDb < 0 || redisDb > 15) {
  throw new Error(
    `Jest worker ${workerId} → Redis DB ${redisDb} out of range (0-15). Ensure integration maxWorkers ≤ 16.`,
  );
}
process.env.REDIS_DB = String(redisDb);
process.env.REDIS_QUEUE_DB = String(redisDb);

// ensureWorkerDatabase() is called from createTestApp() — Jest setupFiles run sync, can't await
