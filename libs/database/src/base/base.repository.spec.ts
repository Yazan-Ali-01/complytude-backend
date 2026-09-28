import { DatabaseService } from '../database.service';
import { BaseRepository } from './base.repository';

interface Row {
  id: string;
}

class TestRepository extends BaseRepository<Row> {
  protected mapRow(row: Record<string, unknown>): Row {
    return { id: String(row.id) };
  }

  protected getSelectColumns(): string {
    return 'id';
  }
}

describe('BaseRepository database context', () => {
  const result = { rows: [{ id: '1' }], rowCount: 1 };
  let query: jest.Mock;
  let transactionWithTenantContext: jest.Mock;
  let databaseService: DatabaseService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue(result);
    transactionWithTenantContext = jest.fn(
      (_ctx: unknown, callback: (client: { query: jest.Mock }) => unknown) =>
        callback({ query: jest.fn().mockResolvedValue(result) }),
    );
    databaseService = {
      query,
      transactionWithTenantContext,
    } as unknown as DatabaseService;
  });

  it.each(['public.tenant_subscriptions', 'documents'])(
    'refuses to query the RLS table %s without a client or tenant',
    async (table) => {
      const repository = new TestRepository(databaseService, table);

      await expect(repository.findById('1')).rejects.toThrow(
        /row-level security/,
      );
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('runs an RLS table query in the tenant context when given a tenant', async () => {
    const repository = new TestRepository(
      databaseService,
      'public.tenant_subscriptions',
    );

    await expect(
      repository.findById('1', {
        tenant: { tenantId: 't1', schema: 'public' },
      }),
    ).resolves.toEqual({ id: '1' });
    expect(transactionWithTenantContext).toHaveBeenCalledWith(
      { tenantId: 't1' },
      expect.any(Function),
    );
  });

  it('uses the given client for an RLS table', async () => {
    const repository = new TestRepository(databaseService, 'public.documents');
    const client = { query: jest.fn().mockResolvedValue(result) };

    await repository.findById('1', { client: client as never });

    expect(client.query).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('still queries a global table without a context', async () => {
    const repository = new TestRepository(databaseService, 'public.plans');

    await expect(repository.findById('1')).resolves.toEqual({ id: '1' });
    expect(query).toHaveBeenCalled();
  });
});
