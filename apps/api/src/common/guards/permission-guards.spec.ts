import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '@lib/audit';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../modules/auth/decorators/roles.decorator';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { PlatformRbacService } from '../../modules/platform-rbac/platform-rbac.service';
import { TenantRbacService } from '../../modules/tenant-rbac/tenant-rbac.service';
import { PLATFORM_PERMISSIONS_KEY } from '../decorators/platform-permissions.decorator';
import { TENANT_PERMISSIONS_KEY } from '../decorators/tenant-permissions.decorator';
import { PlatformPermissionsGuard } from './platform-permissions.guard';
import { TenantPermissionsGuard } from './tenant-permissions.guard';

function createContext(auth: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        auth,
        method: 'POST',
        url: '/api/v1/things',
        headers: {},
      }),
    }),
    getHandler: () => function handler(): void {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

function reflectorReturning(byKey: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => byKey[key]),
  } as unknown as Reflector;
}

const tenantUser = { userId: 'u1', tenantId: 't1', role: 'member' };
const audit = { log: jest.fn().mockResolvedValue(undefined) };
const auditService = audit as unknown as AuditService;
const platformUser = { userId: 'u1', platformRole: 'support' };

describe('Permission and role guards deny by default', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
    audit.log.mockClear();
  });

  describe('TenantPermissionsGuard', () => {
    const rbac = {
      getRolePermissions: jest.fn().mockResolvedValue(['documents:read']),
    } as unknown as TenantRbacService;

    it.each([
      ['no metadata', {}],
      [
        'an empty permission list',
        { [TENANT_PERMISSIONS_KEY]: { permissions: [], requireAll: false } },
      ],
    ])('denies with %s', async (_label, metadata) => {
      const guard = new TenantPermissionsGuard(
        reflectorReturning(metadata),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ tenant: tenantUser })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(loggerError).toHaveBeenCalled();
    });

    it('allows when the role holds a required permission', async () => {
      const guard = new TenantPermissionsGuard(
        reflectorReturning({
          [TENANT_PERMISSIONS_KEY]: {
            permissions: ['documents:read'],
            requireAll: false,
          },
        }),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ tenant: tenantUser })),
      ).resolves.toBe(true);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('records a refused permission in the audit trail', async () => {
      const guard = new TenantPermissionsGuard(
        reflectorReturning({
          [TENANT_PERMISSIONS_KEY]: {
            permissions: ['billing:manage'],
            requireAll: false,
          },
        }),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ tenant: tenantUser })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERMISSION_DENIED',
          actorId: 'u1',
          tenantId: 't1',
          userRole: 'member',
          details: expect.objectContaining({
            required: ['billing:manage'],
            status: 403,
            url: '/api/v1/things',
          }),
        }),
      );
    });
  });

  describe('PlatformPermissionsGuard', () => {
    const rbac = {
      getRolePermissions: jest.fn().mockResolvedValue(['tenants:read']),
    } as unknown as PlatformRbacService;

    it.each([
      ['no metadata', {}],
      [
        'an empty permission list',
        { [PLATFORM_PERMISSIONS_KEY]: { permissions: [], requireAll: false } },
      ],
    ])('denies with %s', async (_label, metadata) => {
      const guard = new PlatformPermissionsGuard(
        reflectorReturning(metadata),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ identity: platformUser })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(loggerError).toHaveBeenCalled();
    });

    it('allows when the role holds a required permission', async () => {
      const guard = new PlatformPermissionsGuard(
        reflectorReturning({
          [PLATFORM_PERMISSIONS_KEY]: {
            permissions: ['tenants:read'],
            requireAll: false,
          },
        }),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ identity: platformUser })),
      ).resolves.toBe(true);
    });

    it('records a refused platform permission in the audit trail', async () => {
      const guard = new PlatformPermissionsGuard(
        reflectorReturning({
          [PLATFORM_PERMISSIONS_KEY]: {
            permissions: ['tenants:create'],
            requireAll: false,
          },
        }),
        rbac,
        auditService,
      );
      await expect(
        guard.canActivate(createContext({ identity: platformUser })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERMISSION_DENIED',
          actorId: 'u1',
          userRole: 'support',
        }),
      );
    });
  });

  describe('RolesGuard', () => {
    it.each([
      ['no metadata', {}],
      ['an empty role list', { [ROLES_KEY]: [] }],
    ])('denies with %s', (_label, metadata) => {
      const guard = new RolesGuard(reflectorReturning(metadata));
      expect(() =>
        guard.canActivate(createContext({ tenant: tenantUser })),
      ).toThrow(ForbiddenException);
      expect(loggerError).toHaveBeenCalled();
    });

    it('returns 401, not a TypeError, when there is no tenant on the request', () => {
      const guard = new RolesGuard(
        reflectorReturning({ [ROLES_KEY]: ['tenant_admin'] }),
      );
      expect(() => guard.canActivate(createContext({}))).toThrow(
        UnauthorizedException,
      );
    });

    it('allows a matching role and rejects a different one', () => {
      const guard = new RolesGuard(
        reflectorReturning({ [ROLES_KEY]: ['member'] }),
      );
      expect(guard.canActivate(createContext({ tenant: tenantUser }))).toBe(
        true,
      );
      expect(() =>
        guard.canActivate(
          createContext({ tenant: { ...tenantUser, role: 'viewer' } }),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
