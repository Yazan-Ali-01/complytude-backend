import { EntitlementProjectionUpdateJobData } from '@lib/queue';
import { CreateDomainEventRow } from 'src/common/types/entitlement.types';

export type EnforcementMode = 'async' | 'sync_fallback';

/**
 * Build the canonical usage.recorded domain event row.
 *
 * Used by both ProjectionUpdateHandler (enforcement_mode: 'async') and the
 * sync fallback in EntitlementEnforcementService (enforcement_mode: 'sync_fallback').
 * Keeping both paths in sync via a single builder prevents drift between the
 * two event shapes. Callers supply caller-specific metadata (e.g. job_id +
 * attempt for the async path, fallback_reason for the sync path).
 */
export function buildUsageRecordedEvent(
  data: EntitlementProjectionUpdateJobData,
  enforcementMode: EnforcementMode,
  metadata: Record<string, unknown>,
): CreateDomainEventRow {
  return {
    tenant_id: data.tenantId,
    event_type: 'usage.recorded',
    aggregate_type: 'usage',
    aggregate_id: data.usageLedgerId,
    actor_id: data.actorId,
    actor_type: data.actorId ? 'user' : 'system',
    payload: JSON.stringify({
      usage_event_id: data.usageLedgerId,
      feature_id: data.featureId,
      feature_key: data.featureKey,
      feature_name: data.featureName,
      feature_type: data.featureType,
      units: data.units,
      allocations: data.allocations,
      billing_period: data.billingPeriod,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      recorded_at: data.recordedAt,
      idempotency_key: data.idempotencyKey,
      enforcement_mode: enforcementMode,
      fallback: enforcementMode === 'sync_fallback',
      credit_deducted: data.creditDeducted,
      credit_amount: data.creditAmount,
    }),
    metadata: JSON.stringify(metadata),
  };
}
