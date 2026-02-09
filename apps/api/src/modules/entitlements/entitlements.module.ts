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
import { CreditBalanceService } from './services/credit-balance.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { EntitlementEnforcementService } from './services/entitlement-enforcement.service';
import { EntitlementResolverService } from './services/entitlement-resolver.service';
import { EntitlementSyncService } from './services/entitlement-sync.service';
import { UsageIngestionService } from './services/usage-ingestion.service';
import { UsageProjectionService } from './services/usage-projection.service';

/**
 * Entitlements Module
 *
 * Global module providing entitlement resolution and enforcement across the application.
 * Marked as @Global() to make services available without explicit imports (like RbacModule).
 *
 * Exports:
 * - EntitlementResolverService: Core entitlement resolution engine
 * - EntitlementEnforcementService: Runtime enforcement with credit fallback (Phase 4)
 * - CreditLedgerService: Credit transaction management (Phase 4)
 * - CreditBalanceService: Credit balance queries (Phase 4)
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
    UsageIngestionService, // Phase 3
    UsageProjectionService, // Phase 3
    EntitlementEnforcementService, // Phase 4
    CreditLedgerService, // Phase 4
    CreditBalanceService, // Phase 4

    // Catalog repositories
    FeaturesRepository,
    PlansRepository,
    PlanEntitlementsRepository,

    // Tenant-scoped repositories
    TenantAddonsRepository,
    TenantOverridesRepository,
    SubscriptionsRepository,

    // Usage repositories (Phase 3)
    UsageLedgerRepository,
    AggregatedUsageRepository,

    // Credit repositories (Phase 4)
    CreditLedgerRepository,
    EntitlementSnapshotsRepository,
    DomainEventsRepository,

    // Tenant repository (needed by resolver)
    TenantRepository,
  ],
  exports: [
    // Services
    EntitlementResolverService,
    UsageIngestionService, // Phase 3
    UsageProjectionService, // Phase 3
    EntitlementEnforcementService, // Phase 4
    CreditLedgerService, // Phase 4
    CreditBalanceService, // Phase 4

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
