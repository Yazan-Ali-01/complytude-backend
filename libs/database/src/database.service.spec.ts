import { Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from './database.service';

describe('DatabaseService transaction helpers', () => {
  let client: { query: jest.Mock; release: jest.Mock };
  let service: DatabaseService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    // Both pools hand out the same mock client; which pool is used is tested below
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const platformPool = { connect: jest.fn().mockResolvedValue(client) };
    service = new DatabaseService(
      pool as unknown as Pool,
      platformPool as unknown as Pool,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const helpers: Array<
    [
      string,
      (
        s: DatabaseService,
        cb: (c: PoolClient) => Promise<unknown>,
      ) => Promise<unknown>,
    ]
  > = [
    ['transaction', (s, cb) => s.transaction(cb)],
    [
      'transactionWithTenantContext',
      (s, cb) => s.transactionWithTenantContext({ tenantId: 't1' }, cb),
    ],
    [
      'transactionWithPlatformAdminContext',
      (s, cb) => s.transactionWithPlatformAdminContext(cb),
    ],
  ];

  describe.each(helpers)('%s', (_name, run) => {
    it('commits and returns the client to the pool', async () => {
      await expect(run(service, () => Promise.resolve('ok'))).resolves.toBe(
        'ok',
      );

      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledWith(undefined);
    });

    it('rolls back, returns the client and rethrows the error', async () => {
      const failure = new Error('insert failed');

      await expect(run(service, () => Promise.reject(failure))).rejects.toBe(
        failure,
      );

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledWith(undefined);
    });

    it('keeps the original error and discards the connection when ROLLBACK fails', async () => {
      const failure = new Error('insert failed');
      const rollbackFailure = new Error('Connection terminated');
      client.query.mockImplementation((sql: string) =>
        sql === 'ROLLBACK'
          ? Promise.reject(rollbackFailure)
          : Promise.resolve({ rows: [] }),
      );

      await expect(run(service, () => Promise.reject(failure))).rejects.toBe(
        failure,
      );

      // A truthy argument makes pg destroy the client instead of pooling it
      expect(client.release).toHaveBeenCalledWith(rollbackFailure);
    });
  });

  describe('platform context', () => {
    it('runs on the platform login, never on the tenant-request pool', async () => {
      const pool = { connect: jest.fn() };
      const platformPool = { connect: jest.fn().mockResolvedValue(client) };
      const withBoth = new DatabaseService(
        pool as unknown as Pool,
        platformPool as unknown as Pool,
      );

      await withBoth.transactionWithPlatformAdminContext(() =>
        Promise.resolve(),
      );

      expect(platformPool.connect).toHaveBeenCalledTimes(1);
      expect(pool.connect).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledWith(
        'SELECT set_config($1, $2, true)',
        ['app.platform_role', 'true'],
      );
    });

    it('is refused in a process without the platform login', async () => {
      const pool = { connect: jest.fn().mockResolvedValue(client) };
      const withoutPlatform = new DatabaseService(pool as unknown as Pool);
      const callback = jest.fn();

      await expect(
        withoutPlatform.transactionWithPlatformAdminContext(callback),
      ).rejects.toThrow('DB_PLATFORM_USER');
      expect(pool.connect).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
