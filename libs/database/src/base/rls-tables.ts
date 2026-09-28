/**
 * Tables with row-level security. With no database context, a read of one returns no rows and a
 * write is rejected, so BaseRepository refuses to query them without a client or tenant.
 * The API's RLS integration suite checks this list against the database.
 */
export const RLS_TABLES: ReadonlySet<string> = new Set([
  'aggregated_usage',
  'analysis_jobs',
  'credit_ledger',
  'documents',
  'domain_events',
  'entitlement_snapshots',
  'generation_jobs',
  'tenant_addons',
  'tenant_overrides',
  'tenant_subscriptions',
  'tenants',
  'usage_ledger',
  'user_tenants',
]);
