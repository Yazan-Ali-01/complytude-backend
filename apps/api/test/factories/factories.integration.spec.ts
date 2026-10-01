import { resetTestState } from '../helpers/redis-flush.helper';
import {
  withPlatformAdminContext,
  withTenantContext,
} from '../helpers/tenant-context.helper';
import { createTestApp } from '../setup/test-app.factory';
import {
  createTestSubscription,
  createTestTenant,
  createTestUser,
  createTestUserInTenant,
} from './index';
import { SystemTenantRole } from 'src/common/types/tenant.types';

describe('Test Data Factories', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  // ---------------------------------------------------------------------------
  // createTestTenant
  // ---------------------------------------------------------------------------

  describe('createTestTenant', () => {
    it('creates a tenant with defaults', async () => {
      const tenant = await createTestTenant(app.module);

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toMatch(/^Test Tenant [a-f0-9]{8}$/);
      expect(tenant.slug).toMatch(/^test-/);
      expect(tenant.is_active).toBe(true);
    });

    it('applies overrides', async () => {
      const tenant = await createTestTenant(app.module, {
        name: 'Acme Corp',
        slug: 'acme-corp',
      });

      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.slug).toBe('acme-corp');
    });

    it('creates unique tenants per call', async () => {
      const tenantA = await createTestTenant(app.module);
      const tenantB = await createTestTenant(app.module);

      expect(tenantA.id).not.toBe(tenantB.id);
      expect(tenantA.slug).not.toBe(tenantB.slug);
    });

    it('works after resetTestState (reference tables survive)', async () => {
      await createTestTenant(app.module);
      await resetTestState(app.databaseService, app.redisClient);

      const tenant = await createTestTenant(app.module);
      expect(tenant.id).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createTestUser
  // ---------------------------------------------------------------------------

  describe('createTestUser', () => {
    it('creates a user with defaults', async () => {
      const user = await createTestUser(app.module);

      expect(user.id).toBeDefined();
      expect(user.email).toMatch(/@test\.com$/);
      expect(user.password_hash).toBeDefined();
      expect(user.is_verified).toBe(true);
    });

    it('applies overrides', async () => {
      const user = await createTestUser(app.module, {
        email: 'custom@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
      });

      expect(user.email).toBe('custom@example.com');
      expect(user.first_name).toBe('Jane');
      expect(user.last_name).toBe('Smith');
    });

    it('creates unique users per call', async () => {
      const userA = await createTestUser(app.module);
      const userB = await createTestUser(app.module);

      expect(userA.id).not.toBe(userB.id);
      expect(userA.email).not.toBe(userB.email);
    });
  });

  // ---------------------------------------------------------------------------
  // createTestUserInTenant
  // ---------------------------------------------------------------------------

  describe('createTestUserInTenant', () => {
    it('creates a user and links to tenant with default role', async () => {
      const tenant = await createTestTenant(app.module);
      const { user, userTenant } = await createTestUserInTenant(
        app.module,
        tenant.id,
      );

      expect(user.id).toBeDefined();
      expect(userTenant.user_id).toBe(user.id);
      expect(userTenant.tenant_id).toBe(tenant.id);
      expect(userTenant.role_key).toBe(SystemTenantRole.MEMBER);
      expect(userTenant.is_active).toBe(true);
    });

    it('applies role override', async () => {
      const tenant = await createTestTenant(app.module);
      const { userTenant } = await createTestUserInTenant(
        app.module,
        tenant.id,
        { role: SystemTenantRole.TENANT_ADMIN },
      );

      expect(userTenant.role_key).toBe(SystemTenantRole.TENANT_ADMIN);
    });

    it('applies user field overrides', async () => {
      const tenant = await createTestTenant(app.module);
      const { user } = await createTestUserInTenant(app.module, tenant.id, {
        email: 'overridden@example.com',
      });

      expect(user.email).toBe('overridden@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // createTestSubscription
  // ---------------------------------------------------------------------------

  describe('createTestSubscription', () => {
    it('creates a subscription with default plan (shield)', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id);

      expect(subscription.id).toBeDefined();
      expect(subscription.tenant_id).toBe(tenant.id);
      expect(subscription.status).toBe('active');
      expect(subscription.billing_period_start).toBeDefined();
      expect(subscription.billing_period_end).toBeDefined();
    });

    it('applies plan override', async () => {
      const tenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(app.module, tenant.id, {
        planKey: 'navigator',
      });

      expect(subscription.tenant_id).toBe(tenant.id);
      expect(subscription.status).toBe('active');
    });

    it('works after resetTestState', async () => {
      const tenant = await createTestTenant(app.module);
      await createTestSubscription(app.module, tenant.id);
      await resetTestState(app.databaseService, app.redisClient);

      const freshTenant = await createTestTenant(app.module);
      const subscription = await createTestSubscription(
        app.module,
        freshTenant.id,
      );
      expect(subscription.id).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // RLS context helpers
  // ---------------------------------------------------------------------------

  describe('withTenantContext — RLS isolation', () => {
    it('positive: can read own tenant user_tenants', async () => {
      const tenant = await createTestTenant(app.module);
      const { userTenant } = await createTestUserInTenant(
        app.module,
        tenant.id,
      );

      const rows = await withTenantContext(
        app.databaseService,
        tenant.id,
        async (client) => {
          const result = await client.query<{ user_id: string }>(
            'SELECT user_id FROM public.user_tenants WHERE tenant_id = $1',
            [tenant.id],
          );
          return result.rows;
        },
      );

      expect(rows.map((r) => r.user_id)).toContain(userTenant.user_id);
    });

    it('negative: cannot read another tenant user_tenants', async () => {
      const tenantA = await createTestTenant(app.module, { name: 'Tenant A' });
      const tenantB = await createTestTenant(app.module, { name: 'Tenant B' });
      await createTestUserInTenant(app.module, tenantA.id);

      const rows = await withTenantContext(
        app.databaseService,
        tenantB.id,
        async (client) => {
          const result = await client.query<{ user_id: string }>(
            'SELECT user_id FROM public.user_tenants WHERE tenant_id = $1',
            [tenantA.id],
          );
          return result.rows;
        },
      );

      expect(rows).toHaveLength(0);
    });
  });

  describe('withPlatformAdminContext — cross-tenant visibility', () => {
    it('can read user_tenants across all tenants', async () => {
      const tenantA = await createTestTenant(app.module, { name: 'Tenant A' });
      const tenantB = await createTestTenant(app.module, { name: 'Tenant B' });
      await createTestUserInTenant(app.module, tenantA.id);
      await createTestUserInTenant(app.module, tenantB.id);

      const rows = await withPlatformAdminContext(
        app.databaseService,
        async (client) => {
          const result = await client.query<{ tenant_id: string }>(
            'SELECT tenant_id FROM public.user_tenants',
          );
          return result.rows;
        },
      );

      const tenantIds = rows.map((r) => r.tenant_id);
      expect(tenantIds).toContain(tenantA.id);
      expect(tenantIds).toContain(tenantB.id);
    });
  });
});
