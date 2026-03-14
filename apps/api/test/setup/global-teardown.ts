import * as fs from 'fs';
import { TEST_CONFIG_PATH } from '../helpers/test-config';

/**
 * Global teardown — runs once after all integration test workers finish.
 * Stops testcontainers and removes temp config file.
 * Wrapped in try/catch to avoid masking test failures.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    const pgContainer = (
      globalThis as unknown as {
        __PG_CONTAINER__?: { stop: () => Promise<unknown> };
      }
    ).__PG_CONTAINER__;
    if (pgContainer) {
      await pgContainer.stop();
    }
  } catch {
    // Ignore — avoid masking test failures
  }

  try {
    const redisContainer = (
      globalThis as unknown as {
        __REDIS_CONTAINER__?: { stop: () => Promise<unknown> };
      }
    ).__REDIS_CONTAINER__;
    if (redisContainer) {
      await redisContainer.stop();
    }
  } catch {
    // Ignore — avoid masking test failures
  }

  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  } catch {
    // Ignore — temp file cleanup is best-effort
  }
}
