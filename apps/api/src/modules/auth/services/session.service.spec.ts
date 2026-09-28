import { RedisService } from '@lib/redis';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import {
  SESSION_KEYS,
  SESSION_LIMIT_LUA_SCRIPT,
} from '../constants/session.constants';
import type {
  IdentitySessionData,
  TenantSessionData,
} from '../interfaces/session.interface';
import { SessionService } from './session.service';

function baseIdentityData(
  overrides?: Partial<IdentitySessionData>,
): IdentitySessionData {
  const now = new Date().toISOString();
  return {
    userId: 'user-1',
    email: 'a@b.com',
    platformRole: null,
    isVerified: true,
    deviceInfo: {
      deviceType: 'desktop',
      browserName: 'Chrome',
      browserVersion: '120',
      operatingSystem: 'Windows',
    },
    ipAddress: '127.0.0.1',
    geoLocation: null,
    sessionName: null,
    activeTenantSessionIds: [],
    createdAt: now,
    lastActivityAt: now,
    ...overrides,
  };
}

describe('SessionService', () => {
  let service: SessionService;
  let redis: jest.Mocked<Pick<RedisService, keyof RedisService>>;
  let config: jest.Mocked<ConfigService>;
  let mockEval: jest.Mock;
  let pipelineMock: {
    del: jest.Mock;
    srem: jest.Mock;
    set: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(() => {
    mockEval = jest.fn();
    pipelineMock = {
      del: jest.fn().mockReturnThis(),
      srem: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      scanKeys: jest.fn(),
      mget: jest.fn(),
      pipeline: jest.fn(() => pipelineMock as never),
      getClient: jest.fn(
        () =>
          ({
            eval: mockEval,
          }) as unknown as Redis,
      ),
    } as unknown as jest.Mocked<Pick<RedisService, keyof RedisService>>;

    config = {
      get: jest.fn((key: string) => {
        if (key === 'session.maxTtlSeconds') return 3600;
        if (key === 'session.idleTimeoutSeconds') return 60;
        if (key === 'session.maxPerUser') return 5;
        if (key === 'session.activityThrottleSeconds') return 120;
        if (key === 'redis.keyPrefix') return 'pfx:';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new SessionService(redis as unknown as RedisService, config);
  });

  describe('createIdentitySession', () => {
    it('stores JSON at identity key with max TTL', async () => {
      const data = baseIdentityData();
      await service.createIdentitySession('sid-1', data);
      expect(redis.set).toHaveBeenCalledWith(
        SESSION_KEYS.identitySession('sid-1'),
        data,
        3600,
      );
    });
  });

  describe('enforceSessionLimit', () => {
    it('evaluates Lua with user set key, new id, max, sentinel, prefix', async () => {
      mockEval.mockResolvedValue('0');
      await service.enforceSessionLimit('u1', 'new-sid');
      expect(mockEval).toHaveBeenCalledWith(
        SESSION_LIMIT_LUA_SCRIPT,
        1,
        SESSION_KEYS.userIdentitySessions('u1'),
        'new-sid',
        '5',
        '9999-12-31T23:59:59.999Z',
        'pfx:',
      );
    });

    it('returns evicted session id when Lua returns one', async () => {
      mockEval.mockResolvedValue('old-sid');
      const ev = await service.enforceSessionLimit('u1', 'new-sid');
      expect(ev).toBe('old-sid');
    });
  });

  describe('findIdentitySessionById and idle timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns session when within idle window', async () => {
      const last = new Date('2026-01-01T11:59:00.000Z').toISOString();
      const data = baseIdentityData({ lastActivityAt: last });
      redis.get.mockResolvedValueOnce(data);
      const found = await service.findIdentitySessionById('sid');
      expect(found).toEqual(data);
    });

    it('deletes session and returns null when idle expired', async () => {
      const last = new Date('2026-01-01T10:00:00.000Z').toISOString();
      const data = baseIdentityData({
        userId: 'u1',
        lastActivityAt: last,
        activeTenantSessionIds: [],
      });
      redis.get.mockResolvedValueOnce(data);
      const delSpy = jest
        .spyOn(service, 'deleteIdentitySession')
        .mockResolvedValue();

      const found = await service.findIdentitySessionById('sid');

      expect(found).toBeNull();
      expect(delSpy).toHaveBeenCalledWith('sid', 'u1');
    });
  });

  describe('identitySessionExistsPure', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns false without deleting when idle expired', async () => {
      const last = new Date('2026-01-01T10:00:00.000Z').toISOString();
      redis.get.mockResolvedValueOnce(
        baseIdentityData({ lastActivityAt: last }),
      );
      const delSpy = jest.spyOn(service, 'deleteIdentitySession');

      const ok = await service.identitySessionExistsPure('sid');

      expect(ok).toBe(false);
      expect(delSpy).not.toHaveBeenCalled();
    });
  });

  describe('createTenantSession', () => {
    it('uses min(identity ttl, maxTtl) when identity key has ttl', async () => {
      redis.ttl.mockResolvedValue(100);
      redis.get.mockResolvedValueOnce(
        baseIdentityData({ activeTenantSessionIds: [] }),
      );
      const ts: TenantSessionData = {
        userId: 'u1',
        tenantId: 't1',
        role: 'member',
        identitySessionId: 'iid',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      };
      await service.createTenantSession('ts1', ts, 'iid');
      expect(redis.set).toHaveBeenCalledWith(
        SESSION_KEYS.tenantSession('ts1'),
        ts,
        100,
      );
    });

    it('uses maxTtl when identity key has no ttl', async () => {
      redis.ttl.mockResolvedValue(-1);
      redis.get.mockResolvedValueOnce(
        baseIdentityData({ activeTenantSessionIds: [] }),
      );
      const ts: TenantSessionData = {
        userId: 'u1',
        tenantId: 't1',
        role: 'member',
        identitySessionId: 'iid',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      };
      await service.createTenantSession('ts1', ts, 'iid');
      expect(redis.set).toHaveBeenCalledWith(
        SESSION_KEYS.tenantSession('ts1'),
        ts,
        3600,
      );
    });
  });

  describe('deleteAnySessionById', () => {
    it('throws NotFound when neither identity nor tenant session exists', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.deleteAnySessionById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getGlobalSessionStats', () => {
    it('counts only non-idle sessions from scanned keys', async () => {
      redis.scanKeys
        .mockResolvedValueOnce(['pfx:identity-session:a'])
        .mockResolvedValueOnce(['pfx:tenant-session:t1']);
      const now = new Date().toISOString();
      // The service fetches each key set with one MGET (identity sessions, then tenant sessions)
      redis.mget
        .mockResolvedValueOnce([
          baseIdentityData({
            deviceInfo: {
              deviceType: 'mobile',
              browserName: 'Safari',
              browserVersion: '1',
              operatingSystem: 'iOS',
            },
            lastActivityAt: now,
          }),
        ])
        .mockResolvedValueOnce([
          {
            userId: 'u1',
            tenantId: 'tenant-x',
            role: 'admin',
            identitySessionId: 'i1',
            createdAt: now,
            lastActivityAt: now,
          } satisfies TenantSessionData,
        ]);

      const stats = await service.getGlobalSessionStats();
      expect(stats.totalIdentitySessions).toBe(1);
      expect(stats.totalTenantSessions).toBe(1);
      expect(stats.byTenantId['tenant-x']).toBe(1);
      expect(stats.byDeviceType['mobile']).toBe(1);
    });
  });
});
