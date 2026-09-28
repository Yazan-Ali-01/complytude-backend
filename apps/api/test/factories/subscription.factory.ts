import { DatabaseService } from '@lib/database';
import { TestingModule } from '@nestjs/testing';
import { PlanKey } from 'src/common/constants/plan-entitlements.constant';
import { TenantSubscription } from 'src/common/types/entitlement.types';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import { TEST_ADMIN_DATABASE } from '../setup/admin-database';

export async function createTestSubscription(
  module: TestingModule,
  tenantId: string,
  overrides?: { planKey?: PlanKey },
): Promise<TenantSubscription> {
  const subscriptionsService = module.get(SubscriptionsService);
  // Fixtures are written as the superuser (RLS bypassed), through the real service
  return module
    .get<DatabaseService>(TEST_ADMIN_DATABASE)
    .transaction((client) =>
      subscriptionsService.createSubscription(
        tenantId,
        overrides?.planKey ?? 'shield',
        null,
        { client },
      ),
    );
}
