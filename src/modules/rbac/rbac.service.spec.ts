import { Test, TestingModule } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { DatabaseService } from '../../database/database.service';
import { TenantRole, PermissionKey } from './types/rbac.types';

/* eslint-disable @typescript-eslint/require-await */

describe('RbacService', () => {
  let service: RbacService;

  const mockDatabaseService = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should load permissions into cache on module init', async () => {
      const mockPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:delete' },
          { role: 'member', permission_key: 'documents:read' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);

      service['onModuleInit']();

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.any(Array),
      );

      const hasPermission = service.hasPermission(
        'tenant_admin',
        'documents:create',
      );
      expect(hasPermission).toBe(true);
    });
  });

  describe('hasPermission', () => {
    beforeEach(async () => {
      const mockPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:delete' },
          { role: 'member', permission_key: 'documents:read' },
          { role: 'member', permission_key: 'documents:create' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should return true when role has permission', () => {
      const result = service.hasPermission('tenant_admin', 'documents:create');
      expect(result).toBe(true);
    });

    it('should return false when role does not have permission', () => {
      const result = service.hasPermission('member', 'documents:delete');
      expect(result).toBe(false);
    });

    it('should return false for permission not in role list', () => {
      const result = service.hasPermission(
        'tenant_admin',
        'contracts:analyze' as PermissionKey,
      );
      expect(result).toBe(false);
    });
  });

  describe('getPermissionsForRole', () => {
    beforeEach(async () => {
      const mockPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:read' },
          { role: 'tenant_admin', permission_key: 'documents:delete' },
          { role: 'member', permission_key: 'documents:create' },
          { role: 'member', permission_key: 'documents:read' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should return all permissions for a role', () => {
      const permissions = service.getPermissionsForRole('tenant_admin');
      expect(permissions).toContain('documents:create');
      expect(permissions).toContain('documents:read');
      expect(permissions).toContain('documents:delete');
      expect(permissions.length).toBe(3);
    });

    it('should return empty array for role with no permissions', () => {
      const permissions = service.getPermissionsForRole('viewer');
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });
  });

  describe('checkPermissions', () => {
    beforeEach(async () => {
      const mockPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:read' },
          { role: 'member', permission_key: 'documents:create' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should return true when role has all required permissions', () => {
      const result = service.checkPermissions('tenant_admin', [
        'documents:create',
        'documents:read',
      ]);
      expect(result).toBe(true);
    });

    it('should return false when role is missing any required permission', () => {
      const result = service.checkPermissions('member', [
        'documents:create',
        'documents:delete',
      ]);
      expect(result).toBe(false);
    });

    it('should return true for empty permission array', () => {
      const result = service.checkPermissions('tenant_admin', []);
      expect(result).toBe(true);
    });
  });

  describe('refreshCache', () => {
    it('should reload permissions from database', async () => {
      const initialPermissions = {
        rows: [{ role: 'tenant_admin', permission_key: 'documents:create' }],
      };

      const updatedPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:read' },
          { role: 'member', permission_key: 'documents:create' },
        ],
      };

      mockDatabaseService.query.mockResolvedValueOnce(initialPermissions);
      service['onModuleInit']();

      let hasPermission = service.hasPermission(
        'tenant_admin',
        'documents:read',
      );
      expect(hasPermission).toBe(false);

      mockDatabaseService.query.mockResolvedValueOnce(updatedPermissions);
      service.refreshCache();

      hasPermission = service.hasPermission('tenant_admin', 'documents:read');
      expect(hasPermission).toBe(true);
    });
  });

  describe('logPermissionCheck', () => {
    beforeEach(async () => {
      const mockPermissions = { rows: [] };
      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should log permission check to database', async () => {
      const auditData = {
        userId: 'user_123',
        tenantId: 'tenant_456',
        role: 'tenant_admin' as TenantRole,
        action: 'documents:create',
        resourceType: 'document',
        resourceId: 'doc_789',
        granted: true,
        aiModelUsed: 'claude-3.5',
        metadata: { requestId: 'req_abc' },
      };

      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      await service['logPermissionCheck'](auditData);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.rbac_audit_log'),
        expect.arrayContaining([
          auditData.userId,
          auditData.tenantId,
          auditData.role,
          auditData.action,
        ]),
      );
    });

    it('should handle logging errors gracefully', async () => {
      mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

      await expect(
        service['logPermissionCheck']({
          userId: 'user_123',
          tenantId: 'tenant_456',
          role: 'tenant_admin',
          action: 'documents:create',
          granted: true,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('permission matrix validation', () => {
    beforeEach(async () => {
      const mockPermissions = {
        rows: [
          {
            role: 'tenant_admin',
            permission_key: 'settings:change_jurisdiction',
          },
          { role: 'legal_counsel', permission_key: 'documents:create' },
          { role: 'member', permission_key: 'documents:create' },
          { role: 'viewer', permission_key: 'documents:read' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should allow tenant_admin to change jurisdiction', () => {
      const result = service.hasPermission(
        'tenant_admin',
        'settings:change_jurisdiction',
      );
      expect(result).toBe(true);
    });

    it('should not allow legal_counsel to change jurisdiction', () => {
      const result = service.hasPermission(
        'legal_counsel',
        'settings:change_jurisdiction',
      );
      expect(result).toBe(false);
    });

    it('should not allow member to change jurisdiction', () => {
      const result = service.hasPermission(
        'member',
        'settings:change_jurisdiction',
      );
      expect(result).toBe(false);
    });

    it('should not allow viewer to change jurisdiction', () => {
      const result = service.hasPermission(
        'viewer',
        'settings:change_jurisdiction',
      );
      expect(result).toBe(false);
    });
  });

  describe('role hierarchy', () => {
    beforeEach(async () => {
      const mockPermissions = {
        rows: [
          { role: 'tenant_admin', permission_key: 'documents:create' },
          { role: 'tenant_admin', permission_key: 'documents:read' },
          { role: 'tenant_admin', permission_key: 'documents:delete' },
          { role: 'tenant_admin', permission_key: 'team:manage' },
          { role: 'legal_counsel', permission_key: 'documents:create' },
          { role: 'legal_counsel', permission_key: 'documents:read' },
          { role: 'legal_counsel', permission_key: 'documents:delete' },
          { role: 'member', permission_key: 'documents:create' },
          { role: 'member', permission_key: 'documents:read' },
          { role: 'viewer', permission_key: 'documents:read' },
        ],
      };

      mockDatabaseService.query.mockResolvedValue(mockPermissions);
      service['onModuleInit']();
    });

    it('should have more permissions for admin than member', () => {
      const adminPerms = service.getPermissionsForRole('tenant_admin').length;
      const memberPerms = service.getPermissionsForRole('member').length;
      expect(adminPerms).toBeGreaterThan(memberPerms);
    });

    it('should have more permissions for member than viewer', () => {
      const memberPerms = service.getPermissionsForRole('member').length;
      const viewerPerms = service.getPermissionsForRole('viewer').length;
      expect(memberPerms).toBeGreaterThan(viewerPerms);
    });

    it('should have admin include team management', () => {
      const adminPerms = service.getPermissionsForRole('tenant_admin');
      expect(adminPerms).toContain('team:manage');
    });

    it('should not have member include team management', () => {
      const memberPerms = service.getPermissionsForRole('member');
      expect(memberPerms).not.toContain('team:manage');
    });
  });
});
