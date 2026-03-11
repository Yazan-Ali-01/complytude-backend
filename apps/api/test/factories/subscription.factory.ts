import { TestingModule } from '@nestjs/testing';
import { PlanKey } from 'src/common/constants/plan-entitlements.constant';
import { TenantSubscription } from 'src/common/types/entitlement.types';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';

export async function createTestSubscription(
  module: TestingModule,
  tenantId: string,
  overrides?: { planKey?: PlanKey },
): Promise<TenantSubscription> {
  const subscriptionsService = module.get(SubscriptionsService);
  return subscriptionsService.createSubscription(
    tenantId,
    overrides?.planKey ?? 'shield',
    null,
  );
}
