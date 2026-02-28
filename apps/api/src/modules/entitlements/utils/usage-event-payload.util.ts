import { EntitlementProjectionUpdateJobData } from '@lib/queue';

export type EnforcementMode = 'async' | 'sync_fallback';

/**
 * Build the canonical usage.recorded event payload JSON string.
 *
 * Used by both ProjectionUpdateHandler (async path, enforcement_mode: 'async')
 * and the sync fallback in EntitlementEnforcementService
 * (enforcement_mode: 'sync_fallback'). Keeping both paths in sync via a
 * single builder prevents drift between the two domain event shapes.
 */
export function buildUsageRecordedPayload(
  data: EntitlementProjectionUpdateJobData,
  enforcementMode: EnforcementMode,
  options?: { fallback?: boolean },
): string {
  return JSON.stringify({
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
    credit_deducted: data.creditDeducted,
    credit_amount: data.creditAmount,
    ...(options?.fallback ? { fallback: true } : {}),
  });
}
