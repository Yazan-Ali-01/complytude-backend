import { PostgreSqlContainer } from '@testcontainers/postgresql';
import * as fs from 'fs';
import { GenericContainer } from 'testcontainers';
import { TEST_CONFIG_PATH } from '../helpers/test-config';

declare global {
  var __PG_CONTAINER__:
    | Awaited<ReturnType<PostgreSqlContainer['start']>>
    | undefined;

  var __REDIS_CONTAINER__:
    | Awaited<ReturnType<GenericContainer['start']>>
    | undefined;
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

  // Roles are cluster-wide in PostgreSQL — creating in 'postgres' makes it available in all worker DBs
  // Required by grant migrations 002, 008, 010, 014
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
  const redisContainer = new GenericContainer(
    'redis:7-alpine',
  ).withExposedPorts(6379);
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
