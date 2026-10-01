import { PostgreSqlContainer } from '@testcontainers/postgresql';
import * as fs from 'fs';
import { GenericContainer } from 'testcontainers';
import {
  APP_LOGIN_PASSWORD,
  APP_LOGIN_USER,
  PLATFORM_LOGIN_PASSWORD,
  PLATFORM_LOGIN_USER,
  TEST_CONFIG_PATH,
} from '../helpers/test-config';

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

  // Roles are cluster-wide in PostgreSQL — creating in 'postgres' makes it available in all worker DBs.
  // app_user (NOLOGIN) is what the grant migrations and RLS policies target. The app connects as
  // app_login, a LOGIN member of app_user: the same shape as scripts/setup-app-user-role.sql creates
  // in deployed environments, so the app runs under RLS. Its platform context runs as a second
  // login that is also a member of app_platform (migration 045). The superuser is kept for
  // migrations, truncation and fixtures.
  const createRoleSql = `DO $$ BEGIN
    BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN CREATE ROLE app_platform NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN CREATE ROLE ${APP_LOGIN_USER} LOGIN PASSWORD '${APP_LOGIN_PASSWORD}' IN ROLE app_user;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN CREATE ROLE ${PLATFORM_LOGIN_USER} LOGIN PASSWORD '${PLATFORM_LOGIN_PASSWORD}'
      IN ROLE app_user, app_platform;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END $$;`;
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
    throw new Error(`Failed to create app roles: ${execResult.output}`);
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
