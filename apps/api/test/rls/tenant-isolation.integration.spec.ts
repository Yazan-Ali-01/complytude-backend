import { DatabaseService, RLS_TABLES } from '@lib/database';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { DatabaseError, type PoolClient } from 'pg';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import { TenantRolesRepository } from 'src/repositories/tenant-rbac/tenant-roles.repository';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { PLATFORM_LOGIN_USER } from '../helpers/test-config';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Tenant isolation, enforced by RLS, tested as the app's real database role (app_login).
 *
 * Every RLS policy is PERMISSIVE and nothing grants access by default, so each policy is what
 * allows one operation. POLICY_CASES has one case per policy: the operation it allows, in the
 * context it allows it. The meta-test drops each policy in turn and checks its case then fails,
 * so every policy is load-bearing, and a new policy without a case fails the suite.
 */

type Context =
  | { kind: 'tenant' } // tenant A, as transactionWithTenantContext sets it
  | { kind: 'platformAdmin' }
  | { kind: 'authFlow' };

interface TenantRows {
  tenantId: string;
  userId: string;
  subscriptionId: string;
  documentId: string;
  analysisJobId: string;
  feedbackId: string;
  auditLogId: string;
  /** An audit row 3 years old, past both retention windows. */
  oldAuditLogId: string;
  creditLedgerId: string;
  domainEventId: string;
  snapshotId: string;
  generationJobId: string;
  tenantAddonId: string;
  overrideId: string;
  usageId: string;
  allocationId: string;
  /** A custom role of the tenant's own (system roles have no tenant_id). */
  roleId: string;
  invitationId: string;
  aggregatedUsageId: string;
  aiConsentId: string;
}

interface World {
  a: TenantRows;
  b: TenantRows;
  /** A user with no membership yet (for membership inserts). */
  outsiderId: string;
  seatsFeatureId: string;
  docsFeatureId: string;
  templateId: string;
  templateVersionId: string;
  addonId: string;
}

/** Resolves true when the operation took effect (a row was read or written). */
type Op = (client: PoolClient, w: World) => Promise<boolean>;

/** 42501 (insufficient privilege) is raised both for a missing GRANT and an RLS WITH CHECK failure. */
type Outcome = 'allowed' | 'no effect' | 'rls violation' | 'permission denied';

interface PolicyCase {
  policy: string;
  table: string;
  context: Context;
  /** The operation the policy allows. */
  run: Op;
  /**
   * Set when app_user has no privilege for the operation, so the policy can never take effect.
   * The case then asserts the privilege error; granting the privilege fails the suite until the
   * case is turned into a real one.
   */
  blockedByGrant?: string;
}

const TENANT: Context = { kind: 'tenant' };
const PLATFORM_ADMIN: Context = { kind: 'platformAdmin' };
const AUTH_FLOW: Context = { kind: 'authFlow' };

const rowCount = async (
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<number> => (await client.query(sql, params)).rowCount ?? 0;

const selectsById =
  (table: string, id: (w: World) => string): Op =>
  async (c, w) =>
    (await rowCount(c, `SELECT 1 FROM public.${table} WHERE id = $1`, [
      id(w),
    ])) === 1;
const updatesById =
  (table: string, set: string, id: (w: World) => string): Op =>
  async (c, w) =>
    (await rowCount(c, `UPDATE public.${table} SET ${set} WHERE id = $1`, [
      id(w),
    ])) === 1;
const deletesById =
  (table: string, id: (w: World) => string): Op =>
  async (c, w) =>
    (await rowCount(c, `DELETE FROM public.${table} WHERE id = $1`, [
      id(w),
    ])) === 1;
const inserts =
  (sql: string, params: unknown[]): Op =>
  async (c) =>
    (await rowCount(c, sql, params)) === 1;

/** An INSERT of one row for tenant `t`, avoiding the tables' unique constraints. */
const INSERT_FOR: Record<string, (t: TenantRows, w: World) => Op> = {
  aggregated_usage: (t, w) =>
    inserts(
      `INSERT INTO public.aggregated_usage (tenant_id, subscription_id, feature_id, billing_period) VALUES ($1, $2, $3, '2026-10')`,
      [t.tenantId, t.subscriptionId, w.docsFeatureId],
    ),
  analysis_finding_feedback: (t) =>
    inserts(
      `INSERT INTO public.analysis_finding_feedback (tenant_id, analysis_job_id, finding_id, decision)
       VALUES ($1, $2, $3, 'accepted')`,
      [t.tenantId, t.analysisJobId, randomUUID()],
    ),
  analysis_jobs: (t) =>
    inserts(
      'INSERT INTO public.analysis_jobs (tenant_id, document_id) VALUES ($1, $2)',
      [t.tenantId, t.documentId],
    ),
  audit_logs: (t) =>
    inserts(
      `INSERT INTO public.audit_logs (tenant_id, action, resource_type) VALUES ($1, 'RLS_FIXTURE', 'test')`,
      [t.tenantId],
    ),
  credit_ledger: (t) =>
    inserts(
      `INSERT INTO public.credit_ledger (tenant_id, transaction_type, amount, balance_after) VALUES ($1, 'grant', 1, 1)`,
      [t.tenantId],
    ),
  documents: (t) =>
    inserts(
      `INSERT INTO public.documents (tenant_id, title, created_by, content) VALUES ($1, 'rls insert', $2, 'text')`,
      [t.tenantId, t.userId],
    ),
  tenant_ai_consents: (t) =>
    inserts(
      `INSERT INTO public.tenant_ai_consents (tenant_id, disclosure_version, accepted_by) VALUES ($1, '2026-10-01', $2)`,
      [t.tenantId, t.userId],
    ),
  domain_events: (t) =>
    inserts(
      `INSERT INTO public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'rls.insert', 'test', $2)`,
      [t.tenantId, randomUUID()],
    ),
  // invalidated: only one active snapshot per tenant is allowed
  entitlement_snapshots: (t) =>
    inserts(
      `INSERT INTO public.entitlement_snapshots (tenant_id, snapshot_data, invalidated_at) VALUES ($1, '{}', now())`,
      [t.tenantId],
    ),
  generation_jobs: (t, w) =>
    inserts(
      `INSERT INTO public.generation_jobs (tenant_id, template_id, template_version_id, job_type, variables, created_by) VALUES ($1, $2, $3, 'preview', '{}', $4)`,
      [t.tenantId, w.templateId, w.templateVersionId, t.userId],
    ),
  // cancelled: only one active row per tenant and add-on is allowed
  tenant_addons: (t, w) =>
    inserts(
      `INSERT INTO public.tenant_addons (tenant_id, addon_id, status) VALUES ($1, $2, 'cancelled')`,
      [t.tenantId, w.addonId],
    ),
  tenant_overrides: (t, w) =>
    inserts(
      `INSERT INTO public.tenant_overrides (tenant_id, feature_id, reason, applied_by, value_int) VALUES ($1, $2, 'rls insert', $3, 1)`,
      [t.tenantId, w.docsFeatureId, t.userId],
    ),
  // cancelled: only one active or trialing subscription per tenant is allowed
  tenant_subscriptions: (t) =>
    inserts(
      `INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, billing_period_start, billing_period_end, current_period_start, current_period_end)
       VALUES ($1, (SELECT id FROM public.plans WHERE key = 'navigator'), 'cancelled', now(), now() + interval '1 month', now(), now() + interval '1 month')`,
      [t.tenantId],
    ),
  usage_ledger: (t, w) =>
    inserts(
      `INSERT INTO public.usage_ledger (tenant_id, feature_id, billing_period) VALUES ($1, $2, '2026-10')`,
      [t.tenantId, w.docsFeatureId],
    ),
  tenant_roles: (t) =>
    inserts(
      `INSERT INTO public.tenant_roles (key, name, tenant_id) VALUES ($1, 'RLS insert', $2)`,
      [`custom_${randomUUID().slice(0, 8)}`, t.tenantId],
    ),
  invitations: (t) =>
    inserts(
      `INSERT INTO public.invitations (email, tenant_id, token_hash, invited_by, expires_at, role_id)
       VALUES ($1, $2, $3, $4, now() + interval '1 day', (SELECT id FROM public.tenant_roles WHERE key = 'member' AND tenant_id IS NULL))`,
      [`insert-${randomUUID()}@test.com`, t.tenantId, randomUUID(), t.userId],
    ),
  // rolled back before the deferred units-sum check runs
  usage_allocations: (t) =>
    inserts(
      `INSERT INTO public.usage_allocations (usage_ledger_id, source, units) VALUES ($1, 'plan', 1)`,
      [t.usageId],
    ),
  user_tenants: (t, w) =>
    inserts(
      `INSERT INTO public.user_tenants (user_id, tenant_id, role_key) VALUES ($1, $2, 'member')`,
      [w.outsiderId, t.tenantId],
    ),
};
const insertsForA =
  (table: string): Op =>
  (c, w) =>
    INSERT_FOR[table](w.a, w)(c, w);

/** An UPDATE app_user may run on each table (usage_ledger only has UPDATE (projected_at)). */
const UPDATE_SET: Record<string, string> = {
  documents: 'title = title',
  tenants: 'name = name',
  usage_ledger: 'projected_at = now()',
  // no tenant_id; app_user has no UPDATE here, so this is refused by the grant
  usage_allocations: 'units = units',
};
const updateSet = (table: string): string =>
  UPDATE_SET[table] ?? 'tenant_id = tenant_id';

const membershipOf =
  (sql: string, tenant: (w: World) => TenantRows): Op =>
  async (c, w) =>
    (await rowCount(c, sql, [tenant(w).userId, tenant(w).tenantId])) === 1;

/** One case per RLS policy (58): the operation the policy allows, in the context it allows it. */
const POLICY_CASES: PolicyCase[] = [
  // tenant_ai_consents (append-only; who may accept is tenant RBAC's call)
  {
    policy: 'tenant_ai_consents_select',
    table: 'tenant_ai_consents',
    context: TENANT,
    run: selectsById('tenant_ai_consents', (w) => w.a.aiConsentId),
  },
  {
    policy: 'tenant_ai_consents_insert',
    table: 'tenant_ai_consents',
    context: TENANT,
    run: insertsForA('tenant_ai_consents'),
  },
  // aggregated_usage
  {
    policy: 'aggregated_usage_select',
    table: 'aggregated_usage',
    context: TENANT,
    run: selectsById('aggregated_usage', (w) => w.a.aggregatedUsageId),
  },
  {
    policy: 'aggregated_usage_insert',
    table: 'aggregated_usage',
    context: TENANT,
    run: insertsForA('aggregated_usage'),
  },
  {
    policy: 'aggregated_usage_update',
    table: 'aggregated_usage',
    context: TENANT,
    run: updatesById(
      'aggregated_usage',
      updateSet('aggregated_usage'),
      (w) => w.a.aggregatedUsageId,
    ),
  },
  {
    policy: 'aggregated_usage_delete',
    table: 'aggregated_usage',
    context: TENANT,
    run: deletesById('aggregated_usage', (w) => w.a.aggregatedUsageId),
  },
  // analysis_jobs
  {
    policy: 'analysis_jobs_select',
    table: 'analysis_jobs',
    context: TENANT,
    run: selectsById('analysis_jobs', (w) => w.a.analysisJobId),
  },
  {
    policy: 'analysis_jobs_insert',
    table: 'analysis_jobs',
    context: TENANT,
    run: insertsForA('analysis_jobs'),
  },
  {
    policy: 'analysis_jobs_update',
    table: 'analysis_jobs',
    context: TENANT,
    run: updatesById(
      'analysis_jobs',
      updateSet('analysis_jobs'),
      (w) => w.a.analysisJobId,
    ),
  },
  // credit_ledger (append-only)
  // audit_logs (append-only)
  {
    policy: 'audit_logs_select',
    table: 'audit_logs',
    context: TENANT,
    run: selectsById('audit_logs', (w) => w.a.auditLogId),
  },
  {
    policy: 'audit_logs_insert',
    table: 'audit_logs',
    context: TENANT,
    run: insertsForA('audit_logs'),
  },
  {
    policy: 'credit_ledger_select',
    table: 'credit_ledger',
    context: TENANT,
    run: selectsById('credit_ledger', (w) => w.a.creditLedgerId),
  },
  {
    policy: 'credit_ledger_insert',
    table: 'credit_ledger',
    context: TENANT,
    run: insertsForA('credit_ledger'),
  },
  // documents
  {
    policy: 'documents_select',
    table: 'documents',
    context: TENANT,
    run: selectsById('documents', (w) => w.a.documentId),
  },
  {
    policy: 'documents_insert',
    table: 'documents',
    context: TENANT,
    run: insertsForA('documents'),
  },
  {
    policy: 'documents_update',
    table: 'documents',
    context: TENANT,
    run: updatesById(
      'documents',
      updateSet('documents'),
      (w) => w.a.documentId,
    ),
  },
  {
    policy: 'documents_delete',
    table: 'documents',
    context: TENANT,
    run: deletesById('documents', (w) => w.a.documentId),
    blockedByGrant:
      'documents are soft-deleted (deleted_at); app_user has no DELETE on documents',
  },
  // domain_events (append-only)
  {
    policy: 'domain_events_select',
    table: 'domain_events',
    context: TENANT,
    run: selectsById('domain_events', (w) => w.a.domainEventId),
  },
  {
    policy: 'domain_events_insert',
    table: 'domain_events',
    context: TENANT,
    run: insertsForA('domain_events'),
  },
  // entitlement_snapshots
  {
    policy: 'entitlement_snapshots_select',
    table: 'entitlement_snapshots',
    context: TENANT,
    run: selectsById('entitlement_snapshots', (w) => w.a.snapshotId),
  },
  {
    policy: 'entitlement_snapshots_insert',
    table: 'entitlement_snapshots',
    context: TENANT,
    run: insertsForA('entitlement_snapshots'),
  },
  {
    policy: 'entitlement_snapshots_update',
    table: 'entitlement_snapshots',
    context: TENANT,
    run: updatesById(
      'entitlement_snapshots',
      updateSet('entitlement_snapshots'),
      (w) => w.a.snapshotId,
    ),
  },
  {
    policy: 'entitlement_snapshots_delete',
    table: 'entitlement_snapshots',
    context: TENANT,
    run: deletesById('entitlement_snapshots', (w) => w.a.snapshotId),
  },
  // generation_jobs: a single FOR ALL policy
  {
    policy: 'generation_jobs_tenant_isolation',
    table: 'generation_jobs',
    context: TENANT,
    run: selectsById('generation_jobs', (w) => w.a.generationJobId),
  },
  // tenant_addons: a tenant writes its own
  {
    policy: 'tenant_addons_select',
    table: 'tenant_addons',
    context: TENANT,
    run: selectsById('tenant_addons', (w) => w.a.tenantAddonId),
  },
  {
    policy: 'tenant_addons_insert',
    table: 'tenant_addons',
    context: TENANT,
    run: insertsForA('tenant_addons'),
  },
  {
    policy: 'tenant_addons_update',
    table: 'tenant_addons',
    context: TENANT,
    run: updatesById(
      'tenant_addons',
      updateSet('tenant_addons'),
      (w) => w.a.tenantAddonId,
    ),
  },
  // tenant_overrides: only platform admins create them
  {
    policy: 'tenant_overrides_select',
    table: 'tenant_overrides',
    context: TENANT,
    run: selectsById('tenant_overrides', (w) => w.a.overrideId),
  },
  {
    policy: 'tenant_overrides_insert',
    table: 'tenant_overrides',
    context: PLATFORM_ADMIN,
    run: insertsForA('tenant_overrides'),
  },
  {
    policy: 'tenant_overrides_update',
    table: 'tenant_overrides',
    context: TENANT,
    run: updatesById(
      'tenant_overrides',
      updateSet('tenant_overrides'),
      (w) => w.a.overrideId,
    ),
  },
  // tenant_subscriptions: only platform admins create them
  {
    policy: 'tenant_subscriptions_select',
    table: 'tenant_subscriptions',
    context: TENANT,
    run: selectsById('tenant_subscriptions', (w) => w.a.subscriptionId),
  },
  {
    policy: 'tenant_subscriptions_insert',
    table: 'tenant_subscriptions',
    context: PLATFORM_ADMIN,
    run: insertsForA('tenant_subscriptions'),
  },
  {
    policy: 'tenant_subscriptions_update',
    table: 'tenant_subscriptions',
    context: TENANT,
    run: updatesById(
      'tenant_subscriptions',
      updateSet('tenant_subscriptions'),
      (w) => w.a.subscriptionId,
    ),
  },
  // tenants
  {
    policy: 'tenant_select',
    table: 'tenants',
    context: TENANT,
    run: selectsById('tenants', (w) => w.a.tenantId),
  },
  {
    policy: 'tenant_insert',
    table: 'tenants',
    context: AUTH_FLOW,
    run: (c, w) => {
      const name = `rls-${randomUUID()}`;
      return inserts(
        'INSERT INTO public.tenants (name, slug) VALUES ($1, $1)',
        [name],
      )(c, w);
    },
  },
  {
    policy: 'tenant_update',
    table: 'tenants',
    context: TENANT,
    run: updatesById('tenants', updateSet('tenants'), (w) => w.a.tenantId),
  },
  // tenant_roles: a tenant's custom roles (system roles, tenant_id NULL, are written in platform context)
  {
    policy: 'tenant_roles_select',
    table: 'tenant_roles',
    context: TENANT,
    run: selectsById('tenant_roles', (w) => w.a.roleId),
  },
  {
    policy: 'tenant_roles_insert',
    table: 'tenant_roles',
    context: TENANT,
    run: insertsForA('tenant_roles'),
  },
  {
    policy: 'tenant_roles_update',
    table: 'tenant_roles',
    context: TENANT,
    run: updatesById(
      'tenant_roles',
      updateSet('tenant_roles'),
      (w) => w.a.roleId,
    ),
  },
  // analysis_finding_feedback: the tenant's own decisions on its analyses' findings
  {
    policy: 'analysis_finding_feedback_select',
    table: 'analysis_finding_feedback',
    context: TENANT,
    run: selectsById('analysis_finding_feedback', (w) => w.a.feedbackId),
  },
  {
    policy: 'analysis_finding_feedback_insert',
    table: 'analysis_finding_feedback',
    context: TENANT,
    run: insertsForA('analysis_finding_feedback'),
  },
  {
    policy: 'analysis_finding_feedback_update',
    table: 'analysis_finding_feedback',
    context: TENANT,
    run: updatesById(
      'analysis_finding_feedback',
      updateSet('analysis_finding_feedback'),
      (w) => w.a.feedbackId,
    ),
  },
  // audit_logs retention: only the platform login, only rows past each window (migration 049)
  {
    policy: 'audit_logs_blank_client',
    table: 'audit_logs',
    context: PLATFORM_ADMIN,
    run: updatesById(
      'audit_logs',
      'ip_address = NULL, user_agent = NULL',
      (w) => w.a.oldAuditLogId,
    ),
  },
  {
    policy: 'audit_logs_expire',
    table: 'audit_logs',
    context: PLATFORM_ADMIN,
    run: deletesById('audit_logs', (w) => w.a.oldAuditLogId),
  },
  // invitations: the inviting tenant's; the auth flow's narrower read is tested separately
  {
    policy: 'invitations_select',
    table: 'invitations',
    context: TENANT,
    run: selectsById('invitations', (w) => w.a.invitationId),
  },
  {
    policy: 'invitations_insert',
    table: 'invitations',
    context: TENANT,
    run: insertsForA('invitations'),
  },
  {
    policy: 'invitations_update',
    table: 'invitations',
    context: TENANT,
    run: updatesById(
      'invitations',
      updateSet('invitations'),
      (w) => w.a.invitationId,
    ),
  },
  {
    policy: 'invitations_delete',
    table: 'invitations',
    context: TENANT,
    run: deletesById('invitations', (w) => w.a.invitationId),
  },
  // usage_allocations: visible and insertable with its usage_ledger row (no tenant_id of its own)
  {
    policy: 'usage_allocations_select',
    table: 'usage_allocations',
    context: TENANT,
    run: selectsById('usage_allocations', (w) => w.a.allocationId),
  },
  {
    policy: 'usage_allocations_insert',
    table: 'usage_allocations',
    context: TENANT,
    run: insertsForA('usage_allocations'),
  },
  // usage_ledger (append-only apart from projected_at / voided_at)
  {
    policy: 'usage_ledger_select',
    table: 'usage_ledger',
    context: TENANT,
    run: selectsById('usage_ledger', (w) => w.a.usageId),
  },
  {
    policy: 'usage_ledger_insert',
    table: 'usage_ledger',
    context: TENANT,
    run: insertsForA('usage_ledger'),
  },
  {
    policy: 'usage_ledger_update',
    table: 'usage_ledger',
    context: TENANT,
    run: updatesById(
      'usage_ledger',
      updateSet('usage_ledger'),
      (w) => w.a.usageId,
    ),
  },
  // user_tenants: members read; tenant admins manage; the auth flow (signup, invitations) inserts
  {
    policy: 'user_tenants_select',
    table: 'user_tenants',
    context: TENANT,
    run: membershipOf(
      'SELECT 1 FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
      (w) => w.a,
    ),
  },
  {
    policy: 'user_tenants_admin_insert',
    table: 'user_tenants',
    context: TENANT,
    run: insertsForA('user_tenants'),
  },
  {
    policy: 'user_tenants_auth_insert',
    table: 'user_tenants',
    context: AUTH_FLOW,
    run: insertsForA('user_tenants'),
  },
  {
    policy: 'user_tenants_admin_update',
    table: 'user_tenants',
    context: TENANT,
    run: membershipOf(
      'UPDATE public.user_tenants SET role_key = role_key WHERE user_id = $1 AND tenant_id = $2',
      (w) => w.a,
    ),
  },
  {
    policy: 'user_tenants_admin_delete',
    table: 'user_tenants',
    context: TENANT,
    run: membershipOf(
      'DELETE FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
      (w) => w.a,
    ),
  },
];

/** Tenant-scoped tables and the id of each tenant's fixture row. */
const TENANT_TABLES: Record<string, (t: TenantRows) => string> = {
  aggregated_usage: (t) => t.aggregatedUsageId,
  analysis_finding_feedback: (t) => t.feedbackId,
  analysis_jobs: (t) => t.analysisJobId,
  audit_logs: (t) => t.auditLogId,
  credit_ledger: (t) => t.creditLedgerId,
  documents: (t) => t.documentId,
  domain_events: (t) => t.domainEventId,
  entitlement_snapshots: (t) => t.snapshotId,
  generation_jobs: (t) => t.generationJobId,
  tenant_addons: (t) => t.tenantAddonId,
  tenant_overrides: (t) => t.overrideId,
  tenant_subscriptions: (t) => t.subscriptionId,
  tenant_ai_consents: (t) => t.aiConsentId,
  usage_ledger: (t) => t.usageId,
  usage_allocations: (t) => t.allocationId,
  tenant_roles: (t) => t.roleId,
  invitations: (t) => t.invitationId,
};

/** Maps an operation's result or error to an Outcome; any other error is a test bug and is rethrown. */
function toOutcome(result: unknown): Outcome {
  if (result === true) return 'allowed';
  if (result === false) return 'no effect';
  if (result instanceof DatabaseError && result.code === '42501') {
    return result.message.includes('row-level security')
      ? 'rls violation'
      : 'permission denied';
  }
  throw result;
}

/** Thrown to roll back an operation after its result is recorded. */
class RollbackAfterCheck extends Error {}

describe('Tenant isolation (RLS) as the app role', () => {
  let app: TestApp;
  let appDb: DatabaseService;
  let admin: DatabaseService;
  let world: World;

  beforeAll(async () => {
    app = await createTestApp();
    appDb = app.appDatabaseService;
    admin = app.databaseService;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    world = await seedWorld();
  }, 30000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function one(sql: string, params: unknown[] = []): Promise<string> {
    const result = await admin.query<{ id: string }>(sql, params);
    return result.rows[0].id;
  }

  /** Two tenants with one row in every tenant-scoped table, written as the superuser. */
  async function seedWorld(): Promise<World> {
    const seatsFeatureId = await one(
      `SELECT id FROM public.features WHERE key = 'user_seats'`,
    );
    const docsFeatureId = await one(
      `SELECT id FROM public.features WHERE key = 'documents_per_month'`,
    );
    const templateId = await one(
      `INSERT INTO public.templates (key, name) VALUES ($1, 'RLS fixture') RETURNING id`,
      [`rls-${randomUUID()}`],
    );
    const templateVersionId = await one(
      `INSERT INTO public.template_versions (template_id, version) VALUES ($1, '1.0.0') RETURNING id`,
      [templateId],
    );
    const addonId = await one(
      `INSERT INTO public.addons (key, name) VALUES ($1, 'RLS fixture') RETURNING id`,
      [`rls-${randomUUID()}`],
    );
    const outsider = await createTestUserInTenant(
      app.module,
      (await createTestTenant(app.module)).id,
    );

    const tenantRows = async (): Promise<TenantRows> => {
      const tenantId = (await createTestTenant(app.module)).id;
      const { user } = await createTestUserInTenant(app.module, tenantId, {
        role: SystemTenantRole.MEMBER,
      });
      const userId = user.id;
      const subscriptionId = await one(
        `INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, billing_period_start, billing_period_end, current_period_start, current_period_end)
         VALUES ($1, (SELECT id FROM public.plans WHERE key = 'navigator'), 'active', now(), now() + interval '1 month', now(), now() + interval '1 month') RETURNING id`,
        [tenantId],
      );
      const documentId = await one(
        `INSERT INTO public.documents (tenant_id, title, created_by, content) VALUES ($1, 'rls fixture', $2, 'text') RETURNING id`,
        [tenantId, userId],
      );
      const usageId = await one(
        `INSERT INTO public.usage_ledger (tenant_id, feature_id, billing_period) VALUES ($1, $2, '2026-09') RETURNING id`,
        [tenantId, seatsFeatureId],
      );
      const analysisJobId = await one(
        'INSERT INTO public.analysis_jobs (tenant_id, document_id) VALUES ($1, $2) RETURNING id',
        [tenantId, documentId],
      );
      return {
        tenantId,
        userId,
        subscriptionId,
        documentId,
        analysisJobId,
        feedbackId: await one(
          `INSERT INTO public.analysis_finding_feedback (tenant_id, analysis_job_id, finding_id, decision)
           VALUES ($1, $2, 'fixture-finding', 'dismissed') RETURNING id`,
          [tenantId, analysisJobId],
        ),
        auditLogId: await one(
          `INSERT INTO public.audit_logs (tenant_id, action, resource_type) VALUES ($1, 'RLS_FIXTURE', 'test') RETURNING id`,
          [tenantId],
        ),
        oldAuditLogId: await one(
          `INSERT INTO public.audit_logs (tenant_id, action, resource_type, ip_address, user_agent, created_at)
           VALUES ($1, 'RLS_FIXTURE', 'test', '10.0.0.1', 'fixture', now() - interval '3 years') RETURNING id`,
          [tenantId],
        ),
        creditLedgerId: await one(
          `INSERT INTO public.credit_ledger (tenant_id, transaction_type, amount, balance_after) VALUES ($1, 'grant', 10, 10) RETURNING id`,
          [tenantId],
        ),
        domainEventId: await one(
          `INSERT INTO public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id) VALUES ($1, 'rls.fixture', 'test', $2) RETURNING id`,
          [tenantId, randomUUID()],
        ),
        snapshotId: await one(
          `INSERT INTO public.entitlement_snapshots (tenant_id, snapshot_data) VALUES ($1, '{}') RETURNING id`,
          [tenantId],
        ),
        generationJobId: await one(
          `INSERT INTO public.generation_jobs (tenant_id, template_id, template_version_id, job_type, variables, created_by) VALUES ($1, $2, $3, 'preview', '{}', $4) RETURNING id`,
          [tenantId, templateId, templateVersionId, userId],
        ),
        tenantAddonId: await one(
          'INSERT INTO public.tenant_addons (tenant_id, addon_id) VALUES ($1, $2) RETURNING id',
          [tenantId, addonId],
        ),
        overrideId: await one(
          `INSERT INTO public.tenant_overrides (tenant_id, feature_id, reason, applied_by, value_int) VALUES ($1, $2, 'rls fixture', $3, 1) RETURNING id`,
          [tenantId, seatsFeatureId, userId],
        ),
        usageId,
        allocationId: await one(
          `INSERT INTO public.usage_allocations (usage_ledger_id, source, units) VALUES ($1, 'plan', 1) RETURNING id`,
          [usageId],
        ),
        roleId: await one(
          `INSERT INTO public.tenant_roles (key, name, tenant_id) VALUES ($1, 'RLS fixture', $2) RETURNING id`,
          [`custom_${randomUUID().slice(0, 8)}`, tenantId],
        ),
        invitationId: await one(
          `INSERT INTO public.invitations (email, tenant_id, token_hash, invited_by, expires_at, role_id)
           VALUES ($1, $2, $3, $4, now() + interval '1 day', (SELECT id FROM public.tenant_roles WHERE key = 'member' AND tenant_id IS NULL))
           RETURNING id`,
          [`invitee-${randomUUID()}@test.com`, tenantId, randomUUID(), userId],
        ),
        aggregatedUsageId: await one(
          `INSERT INTO public.aggregated_usage (tenant_id, subscription_id, feature_id, billing_period) VALUES ($1, $2, $3, '2026-09') RETURNING id`,
          [tenantId, subscriptionId, seatsFeatureId],
        ),
        aiConsentId: await one(
          `INSERT INTO public.tenant_ai_consents (tenant_id, disclosure_version, accepted_by) VALUES ($1, '2026-01-01', $2) RETURNING id`,
          [tenantId, userId],
        ),
      };
    };

    return {
      a: await tenantRows(),
      b: await tenantRows(),
      outsiderId: outsider.user.id,
      seatsFeatureId,
      docsFeatureId,
      templateId,
      templateVersionId,
      addonId,
    };
  }

  /** Runs `op` through the app's own DatabaseService (app_login) in `context`, then rolls it back. */
  async function viaApp(context: Context, op: Op): Promise<Outcome> {
    let result: boolean | undefined;
    const check = async (client: PoolClient): Promise<never> => {
      result = await op(client, world);
      throw new RollbackAfterCheck();
    };
    try {
      if (context.kind === 'tenant') {
        await appDb.transactionWithTenantContext(
          { tenantId: world.a.tenantId },
          check,
        );
      } else if (context.kind === 'platformAdmin') {
        await appDb.transactionWithPlatformAdminContext(check);
      } else {
        // The auth flow context, as AuthService sets it for signup and invitations
        await appDb.transaction(async (client) => {
          await client.query(
            `SELECT set_config('app.is_auth_flow', 'true', true)`,
          );
          return check(client);
        });
      }
    } catch (error) {
      return toOutcome(error instanceof RollbackAfterCheck ? result : error);
    }
    throw new Error('unreachable: the check always rolls back');
  }

  /** The context settings DatabaseService applies, for a client that has SET ROLE to its login. */
  async function applyContext(
    client: PoolClient,
    context: Context,
  ): Promise<void> {
    const set = (key: string, value: string): Promise<unknown> =>
      client.query('SELECT set_config($1, $2, true)', [key, value]);
    if (context.kind === 'tenant') {
      await set('app.tenant_id', world.a.tenantId);
    } else if (context.kind === 'platformAdmin') {
      await set('app.platform_role', 'true');
    } else {
      await set('app.is_auth_flow', 'true');
    }
  }

  /**
   * Runs a case as the app's role inside a superuser transaction, optionally with its policy
   * dropped: platform cases as the platform login, the others as app_user.
   */
  async function runCase(
    testCase: PolicyCase,
    dropPolicy: boolean,
  ): Promise<Outcome> {
    const client = await admin.getClient();
    try {
      await client.query('BEGIN');
      if (dropPolicy) {
        await client.query(
          `DROP POLICY "${testCase.policy}" ON public."${testCase.table}"`,
        );
      }
      await client.query(
        testCase.context.kind === 'platformAdmin'
          ? `SET LOCAL ROLE ${PLATFORM_LOGIN_USER}`
          : 'SET LOCAL ROLE app_user',
      );
      await applyContext(client, testCase.context);
      return toOutcome(await testCase.run(client, world));
    } catch (error) {
      return toOutcome(error);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  describe('every policy allows its operation through the app', () => {
    it.each(POLICY_CASES.map((c) => [c.policy, c] as const))(
      '%s',
      async (_policy, testCase) => {
        const expected: Outcome = testCase.blockedByGrant
          ? 'permission denied'
          : 'allowed';
        expect(await viaApp(testCase.context, testCase.run)).toBe(expected);
      },
    );
  });

  describe("tenant A cannot touch tenant B's rows", () => {
    it.each(Object.keys(TENANT_TABLES))('%s', async (table) => {
      const bId = TENANT_TABLES[table](world.b);
      const outcomes = {
        read: await viaApp(
          TENANT,
          selectsById(table, () => bId),
        ),
        update: await viaApp(
          TENANT,
          updatesById(table, updateSet(table), () => bId),
        ),
        delete: await viaApp(
          TENANT,
          deletesById(table, () => bId),
        ),
        insertAsB: await viaApp(TENANT, (c, w) =>
          INSERT_FOR[table](w.b, w)(c, w),
        ),
      };

      expect(
        Object.entries(outcomes).filter(([, outcome]) => outcome === 'allowed'),
      ).toEqual([]);
      // Reads and B-tenant inserts are refused by RLS itself, not by a missing grant
      expect(outcomes.read).toBe('no effect');
      expect(outcomes.insertAsB).toBe('rls violation');
      const untouched = await admin.query(
        `SELECT 1 FROM public.${table} WHERE id = $1`,
        [bId],
      );
      expect(untouched.rowCount).toBe(1);
    });

    it('tenants and user_tenants', async () => {
      const outcomes = {
        readTenant: await viaApp(
          TENANT,
          selectsById('tenants', (w) => w.b.tenantId),
        ),
        updateTenant: await viaApp(
          TENANT,
          updatesById('tenants', updateSet('tenants'), (w) => w.b.tenantId),
        ),
        readMembership: await viaApp(
          TENANT,
          membershipOf(
            'SELECT 1 FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
            (w) => w.b,
          ),
        ),
        updateMembership: await viaApp(
          TENANT,
          membershipOf(
            'UPDATE public.user_tenants SET role_key = role_key WHERE user_id = $1 AND tenant_id = $2',
            (w) => w.b,
          ),
        ),
        removeMember: await viaApp(
          TENANT,
          membershipOf(
            'DELETE FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
            (w) => w.b,
          ),
        ),
        addMember: await viaApp(TENANT, (c, w) =>
          INSERT_FOR.user_tenants(w.b, w)(c, w),
        ),
      };

      expect(outcomes).toEqual({
        readTenant: 'no effect',
        updateTenant: 'no effect',
        readMembership: 'no effect',
        updateMembership: 'no effect',
        removeMember: 'no effect',
        addMember: 'rls violation',
      });
    });

    it('system roles: readable in any context, written only in platform context', async () => {
      const systemRoles = await appDb.query(
        'SELECT 1 FROM public.tenant_roles WHERE tenant_id IS NULL',
      );
      expect(systemRoles.rowCount).toBeGreaterThan(0);
      const addSystemRole: Op = async (c) =>
        (await rowCount(
          c,
          `INSERT INTO public.tenant_roles (key, name, tenant_id, is_system) VALUES ($1, 'Fake system role', NULL, true)`,
          [`fake_${randomUUID().slice(0, 8)}`],
        )) === 1;
      expect(await viaApp(TENANT, addSystemRole)).toBe('rls violation');
      expect(await viaApp(PLATFORM_ADMIN, addSystemRole)).toBe('allowed');
    });

    it("resolves a custom role's permissions for its own tenant only", async () => {
      await admin.query(
        `INSERT INTO public.tenant_role_permissions (role_id, permission_id)
         SELECT $1, id FROM public.tenant_permissions WHERE key = 'documents:read'`,
        [world.a.roleId],
      );
      const { rows } = await admin.query<{ key: string }>(
        'SELECT key FROM public.tenant_roles WHERE id = $1',
        [world.a.roleId],
      );
      const roles = new TenantRolesRepository(appDb);

      expect(
        await roles.getPermissionsForRole(rows[0].key, world.a.tenantId),
      ).toEqual(['documents:read']);
      expect(
        await roles.getPermissionsForRole(rows[0].key, world.b.tenantId),
      ).toEqual([]);
    });

    it('the auth flow sees only the invitation whose token it presents, or those sent to its own address', async () => {
      const invitation = async (
        id: string,
      ): Promise<{ email: string; token_hash: string }> =>
        (
          await admin.query<{ email: string; token_hash: string }>(
            'SELECT email, token_hash FROM public.invitations WHERE id = $1',
            [id],
          )
        ).rows[0];
      const a = await invitation(world.a.invitationId);
      const b = await invitation(world.b.invitationId);
      const inAuthFlow = <T>(
        settings: Record<string, string>,
        run: (client: PoolClient) => Promise<T>,
      ): Promise<T> =>
        appDb.transaction(async (client) => {
          await client.query(
            `SELECT set_config('app.is_auth_flow', 'true', true)`,
          );
          for (const [name, value] of Object.entries(settings)) {
            await client.query('SELECT set_config($1, $2, true)', [
              name,
              value,
            ]);
          }
          return run(client);
        });
      const visibleIn = (settings: Record<string, string>): Promise<string[]> =>
        inAuthFlow(settings, async (client) =>
          (
            await client.query<{ id: string }>(
              'SELECT id FROM public.invitations WHERE id = ANY($1) ORDER BY id',
              [[world.a.invitationId, world.b.invitationId]],
            )
          ).rows.map((row) => row.id),
        );

      expect(await visibleIn({})).toEqual([]);
      expect(await visibleIn({ 'app.invitee_email': a.email })).toEqual([
        world.a.invitationId,
      ]);
      expect(
        await visibleIn({ 'app.invitation_token_hash': b.token_hash }),
      ).toEqual([world.b.invitationId]);
      // The address alone, without the auth flow, shows nothing
      expect(
        (
          await appDb.transaction(async (client) => {
            await client.query(
              `SELECT set_config('app.invitee_email', $1, true)`,
              [a.email],
            );
            return client.query('SELECT 1 FROM public.invitations');
          })
        ).rowCount,
      ).toBe(0);
      // Visible to its invitee, but not writable in the auth flow
      expect(
        await inAuthFlow({ 'app.invitee_email': a.email }, (client) =>
          rowCount(
            client,
            `UPDATE public.invitations SET status = 'REJECTED' WHERE id = $1`,
            [world.a.invitationId],
          ),
        ),
      ).toBe(0);
    });

    it('setting the platform flag on the tenant-request login unlocks nothing', async () => {
      const asTenantLoginWithFlag = <T>(
        run: (client: PoolClient) => Promise<T>,
      ): Promise<T> =>
        appDb.transaction(async (client) => {
          await client.query(
            `SELECT set_config('app.platform_role', 'true', true)`,
          );
          return run(client);
        });
      const visible: string[] = [];
      await asTenantLoginWithFlag(async (client) => {
        for (const [table, rowId] of Object.entries(TENANT_TABLES)) {
          const result = await client.query(
            `SELECT 1 FROM public.${table} WHERE id = $1`,
            [rowId(world.b)],
          );
          if (result.rowCount) visible.push(table);
        }
      });
      expect(visible).toEqual([]);

      let insertError: unknown;
      try {
        await asTenantLoginWithFlag((client) =>
          INSERT_FOR.documents(world.b, world)(client, world),
        );
      } catch (error) {
        insertError = error;
      }
      expect(toOutcome(insertError)).toBe('rls violation');

      // Nor can that login become the platform login, or take its role
      for (const role of ['app_platform', PLATFORM_LOGIN_USER]) {
        await expect(
          appDb.transaction((client) => client.query(`SET ROLE ${role}`)),
        ).rejects.toThrow('permission denied to set role');
      }

      // The platform context itself still sees tenant B's rows
      expect(
        await appDb.transactionWithPlatformAdminContext(
          async (client) =>
            (
              await client.query(
                'SELECT 1 FROM public.documents WHERE id = $1',
                [world.b.documentId],
              )
            ).rowCount,
        ),
      ).toBe(1);
    });

    it('audit retention touches only rows past its windows, as the platform login, and only to blank or delete', async () => {
      const blank = (id: (w: World) => string): Op =>
        updatesById('audit_logs', 'ip_address = NULL, user_agent = NULL', id);
      const outcomes = {
        blankRecent: await viaApp(
          PLATFORM_ADMIN,
          blank((w) => w.a.auditLogId),
        ),
        deleteRecent: await viaApp(
          PLATFORM_ADMIN,
          deletesById('audit_logs', (w) => w.a.auditLogId),
        ),
        rewriteOldIp: await viaApp(
          PLATFORM_ADMIN,
          updatesById(
            'audit_logs',
            `ip_address = '203.0.113.9'`,
            (w) => w.a.oldAuditLogId,
          ),
        ),
        tenantBlanksOld: await viaApp(
          TENANT,
          blank((w) => w.a.oldAuditLogId),
        ),
        tenantDeletesOld: await viaApp(
          TENANT,
          deletesById('audit_logs', (w) => w.a.oldAuditLogId),
        ),
      };

      expect(outcomes).toEqual({
        blankRecent: 'no effect',
        deleteRecent: 'no effect',
        rewriteOldIp: 'rls violation',
        // The login serving tenant requests stays append-only
        tenantBlanksOld: 'permission denied',
        tenantDeletesOld: 'permission denied',
      });
    });

    it('sees no tenant rows with no context at all (fail closed)', async () => {
      const visible: string[] = [];
      for (const [table, rowId] of Object.entries(TENANT_TABLES)) {
        const result = await appDb.query(
          `SELECT 1 FROM public.${table} WHERE id = $1`,
          [rowId(world.a)],
        );
        if (result.rowCount) visible.push(table);
      }
      const tenants = await appDb.query(
        'SELECT 1 FROM public.tenants WHERE id = $1',
        [world.a.tenantId],
      );
      if (tenants.rowCount) visible.push('tenants');
      expect(visible).toEqual([]);
    });
  });

  it('the helpers every policy calls are plain SQL, and keep their meaning', async () => {
    const helpers = [
      'current_tenant_id_or_null',
      'is_auth_flow',
      'is_platform_admin',
      'allow_cross_tenant_read',
    ];
    const { rows: languages } = await admin.query<{
      proname: string;
      lanname: string;
    }>(
      `SELECT p.proname, l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1) ORDER BY 1`,
      [helpers],
    );
    // plpgsql (with an EXCEPTION block) ran per row; SQL functions are inlined by the planner
    expect(languages.map((r) => r.lanname)).toEqual(helpers.map(() => 'sql'));

    const tenantId = randomUUID();
    const evaluate = (settings: Record<string, string>) =>
      appDb.transaction(async (client) => {
        for (const [name, value] of Object.entries(settings)) {
          await client.query('SELECT set_config($1, $2, true)', [name, value]);
        }
        const { rows } = await client.query<{
          tenant: string | null;
          platform: boolean;
        }>(
          `SELECT current_tenant_id_or_null() AS tenant, is_platform_admin() AS platform`,
        );
        return rows[0];
      });

    expect(await evaluate({})).toEqual({ tenant: null, platform: false });
    expect(await evaluate({ 'app.tenant_id': tenantId })).toEqual({
      tenant: tenantId,
      platform: false,
    });
    // The flag alone is not the platform context: the tenant-request login is no member of app_platform
    expect(await evaluate({ 'app.platform_role': 'true' })).toEqual({
      tenant: null,
      platform: false,
    });
    expect(
      await appDb.transactionWithPlatformAdminContext(
        async (client) =>
          (
            await client.query<{ platform: boolean }>(
              'SELECT is_platform_admin() AS platform',
            )
          ).rows[0].platform,
      ),
    ).toBe(true);
    // A malformed id is no tenant (no error, no match); only the exact string 'true' counts
    expect(
      await evaluate({
        'app.tenant_id': "x' OR '1'='1",
        'app.platform_role': 'TRUE',
      }),
    ).toEqual({ tenant: null, platform: false });
  });

  it("BaseRepository's RLS_TABLES lists exactly the tables with row-level security", async () => {
    const { rows } = await admin.query<{ relname: string }>(
      `SELECT relname FROM pg_class
       WHERE relrowsecurity AND relnamespace = 'public'::regnamespace ORDER BY relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([...RLS_TABLES].sort());
  });

  it('every table with row-level security also forces it on its owner', async () => {
    // A migration that lifts FORCE (e.g. for a backfill) must put it back
    const { rows } = await admin.query<{ relname: string }>(
      `SELECT relname FROM pg_class
       WHERE relrowsecurity AND NOT relforcerowsecurity
         AND relnamespace = 'public'::regnamespace`,
    );
    expect(rows).toEqual([]);
  });

  it('every RLS policy is load-bearing: dropping it makes its case fail', async () => {
    const { rows: policies } = await admin.query<{
      tablename: string;
      policyname: string;
    }>(
      `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`,
    );
    const policyNames = policies.map((p) => p.policyname);
    const casesByPolicy = new Map(POLICY_CASES.map((c) => [c.policy, c]));

    // A new policy needs a case, and a dropped or renamed one must lose its case
    expect(policyNames.filter((name) => !casesByPolicy.has(name))).toEqual([]);
    expect(
      POLICY_CASES.map((c) => c.policy).filter(
        (name) => !policyNames.includes(name),
      ),
    ).toEqual([]);

    const problems: string[] = [];
    for (const { tablename, policyname } of policies) {
      const testCase = casesByPolicy.get(policyname);
      if (!testCase) continue;
      if (testCase.table !== tablename) {
        problems.push(
          `${policyname}: the case says ${testCase.table}, the policy is on ${tablename}`,
        );
        continue;
      }
      const withPolicy = await runCase(testCase, false);
      if (testCase.blockedByGrant) {
        if (withPolicy !== 'permission denied') {
          problems.push(
            `${policyname}: expected no privilege (${testCase.blockedByGrant}), got ${withPolicy}`,
          );
        }
        continue;
      }
      const withoutPolicy = await runCase(testCase, true);
      if (withPolicy !== 'allowed') {
        problems.push(
          `${policyname}: the case fails even with the policy in place (${withPolicy})`,
        );
      } else if (withoutPolicy === 'allowed') {
        problems.push(
          `${policyname}: the case still succeeds without the policy`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  describe('through the real repositories and HTTP routes', () => {
    it("DocumentRepository.findById under tenant A's context doesn't see B's document", async () => {
      const documents = app.module.get(DocumentRepository);
      const [own, other] = await appDb.transactionWithTenantContext(
        { tenantId: world.a.tenantId },
        async (client) => [
          await documents.findById(world.a.documentId, { client }),
          await documents.findById(world.b.documentId, { client }),
        ],
      );
      expect(own?.id).toBe(world.a.documentId);
      expect(other).toBeNull();
    });

    it("GET /documents/:id with tenant A's session returns A's document but not B's", async () => {
      const server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
      const { user } = await createTestUserInTenant(
        app.module,
        world.a.tenantId,
        {
          role: SystemTenantRole.TENANT_ADMIN,
        },
      );
      const login = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: 'Test123!@#' },
      });
      const switched = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/tenant-switch',
        headers: {
          cookie: cookieHeaderFromSetCookie(
            login.headers as Record<string, string | string[] | undefined>,
          ),
        },
        payload: { tenantId: world.a.tenantId },
      });
      const cookie = cookieHeaderFromSetCookie(
        switched.headers as Record<string, string | string[] | undefined>,
      );

      const own = await server.inject({
        method: 'GET',
        url: `/api/v1/documents/${world.a.documentId}`,
        headers: { cookie },
      });
      const other = await server.inject({
        method: 'GET',
        url: `/api/v1/documents/${world.b.documentId}`,
        headers: { cookie },
      });

      expect(own.statusCode).toBe(200);
      expect(other.statusCode).toBe(404);
    });
  });
});
