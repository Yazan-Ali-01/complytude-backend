import { RedisService } from '@lib/redis';
import { SESSION_KEYS } from '../constants/session.constants';
import type {
  IdentitySessionData,
  TenantSessionData,
} from '../interfaces/session.interface';
import { SessionInvalidationService } from './session-invalidation.service';
import { SessionService } from './session.service';

describe('SessionInvalidationService', () => {
  let service: SessionInvalidationService;
  let redis: jest.Mocked<Pick<RedisService, 'get' | 'pipeline'>>;
  let sessionService: jest.Mocked<
    Pick<
      SessionService,
      'getIdentitySessionIds' | 'getTenantSessionIds' | 'deleteTenantSession'
    >
  >;
  let pipeline: {
    del: jest.Mock;
    srem: jest.Mock;
    set: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(() => {
    pipeline = {
      del: jest.fn().mockReturnThis(),
      srem: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    redis = {
      get: jest.fn(),
      pipeline: jest.fn(() => pipeline as never),
    } as unknown as jest.Mocked<Pick<RedisService, 'get' | 'pipeline'>>;

    sessionService = {
      getIdentitySessionIds: jest.fn(),
      getTenantSessionIds: jest.fn(),
      deleteTenantSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<
        SessionService,
        'getIdentitySessionIds' | 'getTenantSessionIds' | 'deleteTenantSession'
      >
    >;

    service = new SessionInvalidationService(
      redis as unknown as RedisService,
      sessionService as unknown as SessionService,
    );
  });

  describe('invalidateAllUserSessions', () => {
    it('no-ops when user has no identity sessions', async () => {
      sessionService.getIdentitySessionIds.mockResolvedValue([]);
      await service.invalidateAllUserSessions('u1');
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('pipelines DEL for identity, tenant keys and SREM for indexes', async () => {
      sessionService.getIdentitySessionIds.mockResolvedValue(['i1']);
      const idSession: IdentitySessionData = {
        userId: 'u1',
        email: 'a@b.com',
        platformRole: null,
        isVerified: true,
        deviceInfo: {
          deviceType: 'desktop',
          browserName: 'x',
          browserVersion: '1',
          operatingSystem: 'y',
        },
        ipAddress: '1.1.1.1',
        geoLocation: null,
        sessionName: null,
        activeTenantSessionIds: ['ts1'],
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        refreshJti: 'jti-1',
      };
      const ts: TenantSessionData = {
        userId: 'u1',
        tenantId: 't1',
        role: 'member',
        identitySessionId: 'i1',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        refreshJti: 'jti-1',
      };
      redis.get.mockResolvedValueOnce(idSession).mockResolvedValueOnce(ts);

      await service.invalidateAllUserSessions('u1');

      expect(pipeline.del).toHaveBeenCalledWith(
        SESSION_KEYS.tenantSession('ts1'),
      );
      expect(pipeline.del).toHaveBeenCalledWith(
        SESSION_KEYS.sessionActivity('ts1'),
      );
      expect(pipeline.del).toHaveBeenCalledWith(
        SESSION_KEYS.identitySession('i1'),
      );
      expect(pipeline.del).toHaveBeenCalledWith(
        SESSION_KEYS.sessionActivity('i1'),
      );
      expect(pipeline.srem).toHaveBeenCalledWith(
        SESSION_KEYS.userTenantSessions('u1', 't1'),
        'ts1',
      );
      expect(pipeline.srem).toHaveBeenCalledWith(
        SESSION_KEYS.userIdentitySessions('u1'),
        'i1',
      );
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe('invalidateTenantSessions', () => {
    it('deletes each of the user tenant sessions through the session service', async () => {
      sessionService.getTenantSessionIds.mockResolvedValue(['ts1', 'ts2']);

      await service.invalidateTenantSessions('u1', 't1');

      expect(sessionService.deleteTenantSession).toHaveBeenCalledWith(
        'ts1',
        'u1',
        't1',
      );
      expect(sessionService.deleteTenantSession).toHaveBeenCalledWith(
        'ts2',
        'u1',
        't1',
      );
    });
  });
});
