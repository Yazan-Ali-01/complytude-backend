import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import * as fs from 'fs';

const TEST_CONFIG_PATH = '/tmp/complytude-test-config.json';

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
  // eslint-disable-next-line no-var
  var __REDIS_CONTAINER__: Awaited<ReturnType<GenericContainer['start']>> | undefined;
}

/**
 * Global setup — runs once before all integration test workers.
 * Starts Postgres + Redis testcontainers, creates app_user role, writes config to temp file.
 */
export default async function globalSetup(): Promise<void> {
  // 1. Start PostgreSQL with pgvector (matches prod docker image)
  const pgContainer = new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withUsername('test')
    .withPassword('test')
    .withDatabase('postgres');

  const startedPg = await pgContainer.start();
  globalThis.__PG_CONTAINER__ = startedPg;

  // 2. Create app_user NOLOGIN role (required by grant migrations 002, 008, 010, 014)
  const createRoleSql = `DO $$ BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
  const execResult = await startedPg.exec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    startedPg.getUsername(),
    '-d',
    'postgres',
    '-c',
    createRoleSql,
  ]);
  if (execResult.exitCode !== 0) {
    throw new Error(`Failed to create app_user role: ${execResult.output}`);
  }

  // 3. Start Redis
  const redisContainer = new GenericContainer('redis:7-alpine').withExposedPorts(6379);
  const startedRedis = await redisContainer.start();
  globalThis.__REDIS_CONTAINER__ = startedRedis;

  // 4. Write connection config for workers
  const config = {
    postgres: {
      host: startedPg.getHost(),
      port: startedPg.getPort(),
      user: startedPg.getUsername(),
      password: startedPg.getPassword(),
    },
    redis: {
      host: startedRedis.getHost(),
      port: startedRedis.getMappedPort(6379),
    },
  };

  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
