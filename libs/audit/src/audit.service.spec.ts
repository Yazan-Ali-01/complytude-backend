/* eslint-disable @typescript-eslint/unbound-method */
import { CLS_TRACE_ID } from '@lib/context';
import { ClsService } from 'nestjs-cls';
import { AuditLogsRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditLog, CreateAuditLogInput } from './audit.types';

const BASE_INPUT: CreateAuditLogInput = {
  action: 'documents:create',
  resourceType: 'documents',
};

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    tenantId: null,
    actorId: null,
    actorType: 'user',
    userRole: null,
    action: 'documents:create',
    resourceType: 'documents',
    resourceId: null,
    details: {},
    aiModelUsed: null,
    ipAddress: null,
    userAgent: null,
    traceId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepository(
  overrides: Partial<AuditLogsRepository> = {},
): jest.Mocked<AuditLogsRepository> {
  return {
    create: jest.fn().mockResolvedValue(makeAuditLog()),
    createBatch: jest.fn().mockResolvedValue([makeAuditLog()]),
    ...overrides,
  } as unknown as jest.Mocked<AuditLogsRepository>;
}

function makeCls(traceId?: string): jest.Mocked<ClsService> {
  return {
    get: jest.fn((key: string) => (key === CLS_TRACE_ID ? traceId : undefined)),
  } as unknown as jest.Mocked<ClsService>;
}

describe('AuditService', () => {
  describe('log()', () => {
    it('calls repository.create with the input', async () => {
      const repo = makeRepository();
      const service = new AuditService(repo, null);

      await service.log(BASE_INPUT);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'documents:create' }),
      );
    });

    it('swallows errors without throwing', async () => {
      const repo = makeRepository({
        create: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const service = new AuditService(repo, null);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.log(BASE_INPUT)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('logBatch()', () => {
    it('calls repository.createBatch with all inputs', async () => {
      const repo = makeRepository();
      const service = new AuditService(repo, null);
      const inputs = [
        BASE_INPUT,
        { ...BASE_INPUT, action: 'documents:delete' },
      ];

      await service.logBatch(inputs);

      expect(repo.createBatch).toHaveBeenCalledTimes(1);
      expect(repo.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ action: 'documents:create' }),
          expect.objectContaining({ action: 'documents:delete' }),
        ]),
      );
    });

    it('is a no-op for empty array', async () => {
      const repo = makeRepository();
      const service = new AuditService(repo, null);

      await service.logBatch([]);

      expect(repo.createBatch).not.toHaveBeenCalled();
    });

    it('swallows errors without throwing', async () => {
      const repo = makeRepository({
        createBatch: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const service = new AuditService(repo, null);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.logBatch([BASE_INPUT])).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('logSystemEvent()', () => {
    it('sets actorType to "system" and omits actorId', async () => {
      const repo = makeRepository();
      const service = new AuditService(repo, null);

      await service.logSystemEvent(BASE_INPUT);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: 'system', actorId: undefined }),
      );
    });
  });

  describe('traceId auto-injection', () => {
    it('injects traceId from CLS when not explicitly provided', async () => {
      const repo = makeRepository();
      const cls = makeCls('trace-from-cls');
      const service = new AuditService(repo, cls);

      await service.log(BASE_INPUT);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'trace-from-cls' }),
      );
    });

    it('does NOT override traceId when explicitly provided', async () => {
      const repo = makeRepository();
      const cls = makeCls('trace-from-cls');
      const service = new AuditService(repo, cls);

      await service.log({ ...BASE_INPUT, traceId: 'explicit-trace' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'explicit-trace' }),
      );
    });

    it('leaves traceId undefined when CLS is null and none provided', async () => {
      const repo = makeRepository();
      const service = new AuditService(repo, null);

      await service.log(BASE_INPUT);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: undefined }),
      );
    });

    it('propagates traceId through logBatch', async () => {
      const repo = makeRepository();
      const cls = makeCls('batch-trace');
      const service = new AuditService(repo, cls);

      await service.logBatch([BASE_INPUT]);

      expect(repo.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ traceId: 'batch-trace' }),
        ]),
      );
    });
  });
});
