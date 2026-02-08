import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CreditLedgerRepository } from '../../repositories/credits/credit-ledger.repository';
import { DomainEventsRepository } from '../../repositories/domain-events/domain-events.repository';
import { EntitlementSnapshotsRepository } from '../../repositories/entitlements/entitlement-snapshots.repository';
import { PlanEntitlementsRepository } from '../../repositories/entitlements/plan-entitlements.repository';
import { TenantAddonsRepository } from '../../repositories/entitlements/tenant-addons.repository';
import { TenantOverridesRepository } from '../../repositories/entitlements/tenant-overrides.repository';
import { FeaturesRepository } from '../../repositories/features/features.repository';
import { PlansRepository } from '../../repositories/plans/plans.repository';
import { SubscriptionsRepository } from '../../repositories/subscriptions/subscriptions.repository';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { AggregatedUsageRepository } from '../../repositories/usage/aggregated-usage.repository';
import { UsageLedgerRepository } from '../../repositories/usage/usage-ledger.repository';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementResolverService } from './services/entitlement-resolver.service';
import { EntitlementSyncService } from './services/entitlement-sync.service';

/**
 * Entitlements Module
 *
 * Global module providing entitlement resolution and enforcement across the application.
 * Marked as @Global() to make services available without explicit imports (like RbacModule).
 *
 * Exports:
 * - EntitlementResolverService: Core entitlement resolution engine
 * - All repositories: For use in other modules
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [EntitlementsController],
  providers: [
    // Core services
    EntitlementResolverService,
    EntitlementSyncService,

    // Catalog repositories
    FeaturesRepository,
    PlansRepository,
    PlanEntitlementsRepository,

    // Tenant-scoped repositories
    TenantAddonsRepository,
    TenantOverridesRepository,
    SubscriptionsRepository,

    // Stub repositories (for future phases)
    UsageLedgerRepository,
    CreditLedgerRepository,
    AggregatedUsageRepository,
    EntitlementSnapshotsRepository,
    DomainEventsRepository,

    // Tenant repository (needed by resolver)
    TenantRepository,
  ],
  exports: [
    // Services
    EntitlementResolverService,

    // Repositories (for use in other modules)
    FeaturesRepository,
    PlansRepository,
    PlanEntitlementsRepository,
    TenantAddonsRepository,
    TenantOverridesRepository,
    SubscriptionsRepository,
    UsageLedgerRepository,
    CreditLedgerRepository,
    AggregatedUsageRepository,
    EntitlementSnapshotsRepository,
    DomainEventsRepository,
  ],
})
export class EntitlementsModule {}
