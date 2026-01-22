import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from '../../modules/rbac/rbac.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionKey, TenantRole } from '../../modules/rbac/types/rbac.types';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let _reflector: Reflector;
  let _rbacService: RbacService;

  const mockRbacService = {
    checkPermissions: jest.fn(),
    logPermissionCheck: jest.fn(),
    hasPermission: jest.fn(),
    getPermissionsForRole: jest.fn(),
    refreshCache: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    _reflector = module.get<Reflector>(Reflector);
    _rbacService = module.get<RbacService>(RbacService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    permissions: PermissionKey[] | null = null,
    user: any = null,
  ): ExecutionContext => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user,
        }),
      }),
    } as unknown as ExecutionContext;

    mockReflector.getAllAndOverride.mockReturnValue(permissions);

    return context;
  };

  describe('canActivate with no permissions required', () => {
    it('should return true when no permissions are required', async () => {
      const context = createMockExecutionContext(null);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRbacService.checkPermissions).not.toHaveBeenCalled();
    });

    it('should return true when empty permission array is required', async () => {
      const context = createMockExecutionContext([]);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRbacService.checkPermissions).not.toHaveBeenCalled();
    });
  });

  describe('canActivate with valid user', () => {
    it('should allow access when user has required permissions', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:create'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
        email: 'test@example.com',
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRbacService.checkPermissions).toHaveBeenCalledWith(
        'tenant_admin',
        ['documents:create'],
      );
      expect(mockRbacService.logPermissionCheck).toHaveBeenCalledWith({
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin',
        action: 'documents:create',
        granted: true,
      });
    });

    it('should allow access when user has all required permissions', async () => {
      const requiredPermissions: PermissionKey[] = [
        'documents:create',
        'documents:read',
        'documents:delete',
      ];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRbacService.checkPermissions).toHaveBeenCalledWith(
        'tenant_admin',
        ['documents:create', 'documents:read', 'documents:delete'],
      );
    });
  });

  describe('canActivate with missing permissions', () => {
    it('should throw ForbiddenException when user lacks permissions', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:delete'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'member' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockRbacService.checkPermissions).toHaveBeenCalledWith('member', [
        'documents:delete',
      ]);
      expect(mockRbacService.logPermissionCheck).toHaveBeenCalledWith({
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'member',
        action: 'documents:delete',
        granted: false,
      });
    });

    it('should throw ForbiddenException with list of missing permissions', async () => {
      const requiredPermissions: PermissionKey[] = [
        'documents:delete',
        'team:manage',
      ];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'member' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Missing required permissions: documents:delete, team:manage',
      );
    });
  });

  describe('canActivate with no user', () => {
    it('should throw ForbiddenException when user is missing from request', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:read'];
      const context = createMockExecutionContext(requiredPermissions, null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No role assigned',
      );
    });

    it('should throw ForbiddenException when user has no role', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:read'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No role assigned',
      );
    });
  });

  describe('canActivate with different roles', () => {
    it('should allow tenant_admin to access team:manage', async () => {
      const requiredPermissions: PermissionKey[] = ['team:manage'];

      const user = {
        userId: 'admin_user',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should deny member access to team:manage', async () => {
      const requiredPermissions: PermissionKey[] = ['team:manage'];

      const user = {
        userId: 'member_user',
        tenantId: 'tenant_456',
        role: 'member' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('canActivate with jurisdiction change permission', () => {
    it('should allow tenant_admin to change jurisdiction', async () => {
      const requiredPermissions: PermissionKey[] = [
        'settings:change_jurisdiction',
      ];

      const user = {
        userId: 'admin_user',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should deny legal_counsel access to change jurisdiction', async () => {
      const requiredPermissions: PermissionKey[] = [
        'settings:change_jurisdiction',
      ];

      const user = {
        userId: 'counsel_user',
        tenantId: 'tenant_456',
        role: 'legal_counsel' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should deny member access to change jurisdiction', async () => {
      const requiredPermissions: PermissionKey[] = [
        'settings:change_jurisdiction',
      ];

      const user = {
        userId: 'member_user',
        tenantId: 'tenant_456',
        role: 'member' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('reflector integration', () => {
    it('should check both handler and class-level permissions', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:read'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'viewer' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        PERMISSIONS_KEY,
        expect.any(Array),
      );
    });
  });

  describe('audit logging', () => {
    it('should log successful permission check', async () => {
      const requiredPermissions: PermissionKey[] = ['documents:create'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      await guard.canActivate(context);

      expect(mockRbacService.logPermissionCheck).toHaveBeenCalledWith({
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin',
        action: expect.any(String),
        granted: true,
      });
    });

    it('should log failed permission check', async () => {
      const requiredPermissions: PermissionKey[] = ['team:manage'];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'member' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(false);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
      }

      expect(mockRbacService.logPermissionCheck).toHaveBeenCalledWith({
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'member',
        action: 'team:manage',
        granted: false,
      });
    });

    it('should include multiple permissions in audit log', async () => {
      const requiredPermissions: PermissionKey[] = [
        'documents:create',
        'documents:read',
      ];

      const user = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
      };

      const context = createMockExecutionContext(requiredPermissions, user);

      mockRbacService.checkPermissions.mockReturnValue(true);

      await guard.canActivate(context);

      expect(mockRbacService.logPermissionCheck).toHaveBeenCalledWith({
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin',
        action: expect.stringContaining('documents:create'),
        granted: true,
      });
    });
  });
});
