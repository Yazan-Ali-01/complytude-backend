import type { DatabaseService } from '@lib/database';
import { AuditLogsRepository } from './audit.repository';

describe('AuditLogsRepository paging', () => {
  it.each([
    [
      'findByTenant',
      (r: AuditLogsRepository) =>
        r.findByTenant('t1', { limit: 5, offset: 10 }),
    ],
    [
      'findByActor',
      (r: AuditLogsRepository) => r.findByActor('a1', { limit: 5, offset: 10 }),
    ],
  ])('%s binds LIMIT and OFFSET as parameters', async (_name, run) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const inContext = (...args: unknown[]): unknown =>
      (args[args.length - 1] as (c: typeof client) => unknown)(client);
    const repository = new AuditLogsRepository({
      transactionWithTenantContext: jest.fn(inContext),
      transactionWithPlatformAdminContext: jest.fn(inContext),
    } as unknown as DatabaseService);

    await run(repository);

    const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).toContain('LIMIT $2 OFFSET $3');
    expect(params).toEqual([expect.any(String), 5, 10]);
  });
});
