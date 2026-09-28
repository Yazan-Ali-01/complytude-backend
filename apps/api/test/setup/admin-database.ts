import { DatabaseService } from '@lib/database';
import * as fs from 'fs';
import { Pool } from 'pg';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

/**
 * DI token for the superuser DatabaseService of the current worker database. Fixtures, truncation
 * and raw assertions use it; it bypasses RLS. The application itself connects as app_login, so
 * everything the app does is subject to RLS, as in deployed environments.
 */
export const TEST_ADMIN_DATABASE = Symbol('TEST_ADMIN_DATABASE');

export const adminDatabaseProvider = {
  provide: TEST_ADMIN_DATABASE,
  useFactory: (): DatabaseService => {
    const config = JSON.parse(
      fs.readFileSync(TEST_CONFIG_PATH, 'utf-8'),
    ) as TestContainerConfig;
    const { host, port, user, password } = config.postgres;
    return new DatabaseService(
      new Pool({
        host,
        port,
        user,
        password,
        database: process.env.DB_NAME,
        max: 5,
      }),
    );
  },
};
