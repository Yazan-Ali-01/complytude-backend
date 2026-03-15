import { AuditLogsRepository } from '@lib/audit/audit.repository';
import { CreateAuditLogInput } from '@lib/audit/audit.types';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp } from '../setup/test-app.factory';

const BASE_INPUT: CreateAuditLogInput = {
  action: 'documents:create',
  resourceType: 'documents',
};

describe('AuditLogsRepository', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let repo: AuditLogsRepository;

  beforeAll(async () => {
    app = await createTestApp();
    repo = app.module.get(AuditLogsRepository);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('inserts a row and returns the mapped entity', async () => {
      const log = await repo.create(BASE_INPUT);

      expect(log.id).toBeDefined();
      expect(log.action).toBe('documents:create');
      expect(log.resourceType).toBe('documents');
      expect(log.actorType).toBe('user');
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('persists optional fields correctly', async () => {
      const resourceId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
      const input: CreateAuditLogInput = {
        ...BASE_INPUT,
        tenantId: undefined,
        actorId: undefined,
        actorType: 'system',
        userRole: 'admin',
        resourceId,
        details: { key: 'value' },
        traceId: 'trace-abc',
      };

      const log = await repo.create(input);

      expect(log.actorId).toBeNull();
      expect(log.actorType).toBe('system');
      expect(log.userRole).toBe('admin');
      expect(log.resourceId).toBe(resourceId);
      expect(log.details).toEqual({ key: 'value' });
      expect(log.traceId).toBe('trace-abc');
    });

    it('defaults actorType to "user" when not provided', async () => {
      const log = await repo.create(BASE_INPUT);
      expect(log.actorType).toBe('user');
    });

    it('stores null for optional fields when omitted', async () => {
      const log = await repo.create(BASE_INPUT);

      expect(log.tenantId).toBeNull();
      expect(log.actorId).toBeNull();
      expect(log.resourceId).toBeNull();
      expect(log.traceId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // createBatch()
  // ---------------------------------------------------------------------------

  describe('createBatch()', () => {
    it('returns empty array for empty input', async () => {
      const results = await repo.createBatch([]);
      expect(results).toEqual([]);
    });

    it('inserts all rows and returns mapped entities', async () => {
      const inputs: CreateAuditLogInput[] = [
        {
          action: 'documents:create',
          resourceType: 'documents',
          traceId: 'trace-1',
        },
        {
          action: 'documents:delete',
          resourceType: 'documents',
          traceId: 'trace-2',
        },
        { action: 'users:read', resourceType: 'users', traceId: 'trace-3' },
      ];

      const results = await repo.createBatch(inputs);

      expect(results).toHaveLength(3);

      const actions = results.map((r) => r.action).sort();
      expect(actions).toEqual([
        'documents:create',
        'documents:delete',
        'users:read',
      ]);
    });

    it('assigns unique IDs to each row', async () => {
      const inputs: CreateAuditLogInput[] = [
        { ...BASE_INPUT, action: 'a:b' },
        { ...BASE_INPUT, action: 'c:d' },
      ];

      const results = await repo.createBatch(inputs);

      expect(results[0].id).toBeDefined();
      expect(results[1].id).toBeDefined();
      expect(results[0].id).not.toBe(results[1].id);
    });

    it('persists a single-item batch correctly', async () => {
      const results = await repo.createBatch([BASE_INPUT]);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe(BASE_INPUT.action);
    });
  });
});
