import { Logger } from '@nestjs/common';
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

describe('BaseRepository SQL built from object keys', () => {
  interface Item {
    id: string;
    name?: string;
    is_active?: boolean;
    tenant_id?: string;
  }

  class ItemRepository extends BaseRepository<Item, Partial<Item>> {
    protected mapRow(row: Record<string, unknown>): Item {
      return { id: String(row.id) };
    }

    protected getSelectColumns(): string {
      return 'id';
    }
  }

  class GuardedRepository extends ItemRepository {
    protected readonly writableColumns: ReadonlySet<string> = new Set([
      'name',
      'is_active',
    ]);
  }

  let query: jest.Mock;
  let databaseService: DatabaseService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [{ id: '1' }], rowCount: 1 });
    databaseService = { query } as unknown as DatabaseService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('quotes the columns it inserts, updates and filters on', async () => {
    const repository = new ItemRepository(databaseService, 'public.items');

    await repository.create({ name: 'a', is_active: true });
    await repository.update('1', { name: 'b' });
    await repository.findOne({ filters: { name: 'b' }, select: ['id'] });

    const [insert, update, select] = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, ' '),
    );
    expect(insert).toContain('("name", "is_active") VALUES ($1, $2)');
    expect(update).toContain('SET "name" = $2');
    expect(select).toContain('SELECT "id" FROM public.items WHERE "name" = $1');
  });

  it.each([
    [
      'create',
      (r: ItemRepository) => r.create({ 'name) VALUES (1); --': 'x' } as never),
    ],
    [
      'update',
      (r: ItemRepository) => r.update('1', { 'name = 1, id': 'x' } as never),
    ],
    [
      'findOne filters',
      (r: ItemRepository) =>
        r.findOne({ filters: { '1=1 OR id': 'x' } as never }),
    ],
    [
      'findOne select',
      (r: ItemRepository) => r.findOne({ select: ['*' as never] }),
    ],
    [
      'a camelCase key',
      (r: ItemRepository) => r.create({ isActive: true } as never),
    ],
  ])(
    'refuses a column name that is not a bare identifier (%s) before querying',
    async (_case, run) => {
      const repository = new ItemRepository(databaseService, 'public.items');

      await expect(run(repository)).rejects.toThrow(/Invalid column name/);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('writes only the declared columns when a repository declares them', async () => {
    const repository = new GuardedRepository(databaseService, 'public.items');

    await expect(
      repository.create({ name: 'a', tenant_id: 'other' }),
    ).rejects.toThrow(/tenant_id is not writable/);
    await expect(
      repository.update('1', { tenant_id: 'other' }),
    ).rejects.toThrow(/not writable/);
    expect(query).not.toHaveBeenCalled();

    await repository.create({ name: 'a', is_active: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('logs how many parameters a query has, never their values', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const repository = new ItemRepository(databaseService, 'public.items');
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }] }),
    };

    await repository.create({ name: 'secret-hash-value' });
    await repository.findOne({ filters: { name: 'secret-hash-value' } });
    await repository.findOne({
      filters: { name: 'secret-hash-value' },
      client: client as never,
    });

    const logged = debug.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('params=1');
    expect(logged).not.toContain('secret-hash-value');
  });

  it('sets the auth-flow flag for the transaction only', async () => {
    const repository = new ItemRepository(databaseService, 'public.items');
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await repository.findOne({
      filters: { name: 'a' },
      client: client as never,
      isAuthflow: true,
    });

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      "SELECT set_config('app.is_auth_flow', 'true', true)",
    );
  });
});
