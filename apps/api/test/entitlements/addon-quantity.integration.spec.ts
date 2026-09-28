import { randomUUID } from 'node:crypto';
import { EntitlementResolverService } from 'src/modules/entitlements/services/entitlement-resolver.service';
import { createTestSubscription, createTestTenant } from '../factories';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Stripe bills an add-on item as quantity × price, so its numeric grants must count once per
 * unit bought. Navigator's documents_per_month is 3.
 */
describe('Add-on quantity in entitlements (app role)', () => {
  let app: TestApp;
  let resolver: EntitlementResolverService;

  beforeAll(async () => {
    app = await createTestApp();
    resolver = app.module.get(EntitlementResolverService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A Navigator tenant holding `quantity` units of an add-on granting `perUnit` documents. */
  async function tenantWithAddon(
    quantity: number,
    perUnit: number,
  ): Promise<string> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const db = app.databaseService;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.addons (key, name) VALUES ($1, 'Extra documents') RETURNING id`,
      [`extra-docs-${randomUUID()}`],
    );
    await db.query(
      `INSERT INTO public.addon_entitlements (addon_id, feature_id, value_int)
       VALUES ($1, (SELECT id FROM public.features WHERE key = 'documents_per_month'), $2)`,
      [rows[0].id, perUnit],
    );
    await db.query(
      `INSERT INTO public.tenant_addons (tenant_id, addon_id, quantity) VALUES ($1, $2, $3)`,
      [tenant.id, rows[0].id, quantity],
    );
    return tenant.id;
  }

  async function documentsPerMonth(
    tenantId: string,
  ): Promise<number | undefined> {
    return (await resolver.resolveForTenant(tenantId, 'documents_per_month'))
      ?.value_int;
  }

  it('grants the add-on once per unit bought', async () => {
    expect(await documentsPerMonth(await tenantWithAddon(3, 50))).toBe(3 + 150);
  });

  it('a single unit grants its value once', async () => {
    expect(await documentsPerMonth(await tenantWithAddon(1, 50))).toBe(3 + 50);
  });

  it('an unlimited add-on stays unlimited whatever the quantity', async () => {
    expect(await documentsPerMonth(await tenantWithAddon(2, -1))).toBe(-1);
  });
});
