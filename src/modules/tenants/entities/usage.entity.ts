export interface TenantUsage {
  id: string;
  tenantId: string;
  featureKey: string;
  periodStart: Date;
  periodEnd: Date;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageEvent {
  id: string;
  tenantId: string;
  featureKey: string;
  userId: string | null;
  eventType: 'increment' | 'decrement' | 'reset';
  delta: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface UsageCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  message: string;
  /** True if a credit was consumed to allow this action */
  usedCredit?: boolean;
  /** Number of credits remaining after this action (if credits were checked) */
  creditsRemaining?: number;
}

export interface UsageSummary {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  features: Record<string, UsageCheckResult>;
}

export interface TenantUsageRow {
  id: string;
  tenant_id: string;
  feature_key: string;
  period_start: Date;
  period_end: Date;
  usage_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface UsageEventRow {
  id: string;
  tenant_id: string;
  feature_key: string;
  user_id: string | null;
  event_type: string;
  delta: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export function mapUsageRow(row: TenantUsageRow): TenantUsage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    featureKey: row.feature_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUsageEventRow(row: UsageEventRow): UsageEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    featureKey: row.feature_key,
    userId: row.user_id,
    eventType: row.event_type as UsageEvent['eventType'],
    delta: row.delta,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}
