import { Global, Module } from '@nestjs/common';
import { CreditLedgerRepository } from 'src/repositories/credits/credit-ledger.repository';
import { DomainEventsRepository } from 'src/repositories/domain-events/domain-events.repository';
import { PlanEntitlementsRepository } from 'src/repositories/entitlements/plan-entitlements.repository';
import { TenantAddonsRepository } from 'src/repositories/entitlements/tenant-addons.repository';
import { TenantOverridesRepository } from 'src/repositories/entitlements/tenant-overrides.repository';
import { FeaturesRepository } from 'src/repositories/features/features.repository';
import { PlansRepository } from 'src/repositories/plans/plans.repository';
import { SubscriptionsRepository } from 'src/repositories/subscriptions/subscriptions.repository';
import { AggregatedUsageRepository } from 'src/repositories/usage/aggregated-usage.repository';
import { UsageAllocationsRepository } from 'src/repositories/usage/usage-allocations.repository';
import { UsageLedgerRepository } from 'src/repositories/usage/usage-ledger.repository';
import { I18nModule } from '../../i18n/i18n.module';
import { AddonsRepository } from '../../repositories/entitlements/addons.repository';
import { EntitlementSnapshotsRepository } from '../../repositories/entitlements/entitlement-snapshots.repository';
import { AddonCatalogController } from './controllers/addon-catalog.controller';
import { PlatformAddonsController } from './controllers/platform-addons.controller';
import { TenantAddonsController } from './controllers/tenant-addons.controller';
import { TenantOverridesReadController } from './controllers/tenant-overrides-read.controller';
import { TenantOverridesController } from './controllers/tenant-overrides.controller';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementQueueProcessor } from './processors/entitlement-queue.processor';
import { ProjectionUpdateHandler } from './processors/projection-update.handler';
import { CreditBalanceService } from './services/credit-balance.service';
import { CreditLedgerService } from './services/credit-ledger.service';
import { DomainEventsService } from './services/domain-events.service';
import { EntitlementEnforcementService } from './services/entitlement-enforcement.service';
import { EntitlementResolverService } from './services/entitlement-resolver.service';
import { EntitlementSnapshotService } from './services/entitlement-snapshot.service';
import { EntitlementSyncService } from './services/entitlement-sync.service';
import { ProjectionReconciliationService } from './services/projection-reconciliation.service';
import { TenantAddonsService } from './services/tenant-addons.service';
import { TenantOverridesService } from './services/tenant-overrides.service';
import { UsageIngestionService } from './services/usage-ingestion.service';
import { UsageProjectionService } from './services/usage-projection.service';

/**
 * Entitlements Module
 *
 * Global module providing entitlement resolution and enforcement across the application.
 * Marked as @Global() to make services available without explicit imports (like RbacModule).
 *
 * Exports:
 * - EntitlementResolverService: Core entitlement resolution engine (snapshot-first, Phase 8)
 * - EntitlementEnforcementService: Runtime enforcement with credit fallback (Phase 4)
 * - CreditLedgerService: Credit transaction management (Phase 4)
 * - CreditBalanceService: Credit balance queries (Phase 4)
 * - DomainEventsService: Domain event queries and replay (Phase 7)
 * - EntitlementSnapshotService: Snapshot lifecycle management (Phase 8)
 * - All repositories: For use in other modules
 */
@Global()
@Module({
  imports: [I18nModule],
  controllers: [
    EntitlementsController,
    AddonCatalogController,
    TenantAddonsController,
    TenantOverridesController,
    TenantOverridesReadController,
    PlatformAddonsController,
  ],
  providers: [
    // Core services
    EntitlementResolverService,
    EntitlementSyncService,
    UsageIngestionService, // Phase 3
    UsageProjectionService, // Phase 3
    EntitlementEnforcementService, // Phase 4
    CreditLedgerService, // Phase 4
    CreditBalanceService, // Phase 4
    DomainEventsService, // Phase 7
    EntitlementSnapshotService, // Phase 8
    TenantAddonsService, // Add-on mutations with snapshot invalidation
    TenantOverridesService, // Override mutations with snapshot invalidation
    ProjectionReconciliationService, // COM-135 — drift detection + auto-correction
    AddonsRepository,

    // Queue processor + handlers
    EntitlementQueueProcessor,
    ProjectionUpdateHandler,

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
    UsageAllocationsRepository,
    AggregatedUsageRepository,

    // Credit repositories (Phase 4)
    CreditLedgerRepository,
    EntitlementSnapshotsRepository,
    DomainEventsRepository,
  ],
  exports: [
    // Services
    EntitlementResolverService,
    UsageIngestionService, // Phase 3
    UsageProjectionService, // Phase 3
    EntitlementEnforcementService, // Phase 4
    CreditLedgerService, // Phase 4
    CreditBalanceService, // Phase 4
    DomainEventsService, // Phase 7
    EntitlementSnapshotService, // Phase 8
    TenantAddonsService,
    TenantOverridesService,
    AddonsRepository,
    ProjectionReconciliationService,

    // Repositories (for use in other modules)
    FeaturesRepository,
    PlansRepository,
    PlanEntitlementsRepository,
    TenantAddonsRepository,
    TenantOverridesRepository,
    SubscriptionsRepository,
    UsageLedgerRepository,
    UsageAllocationsRepository,
    CreditLedgerRepository,
    AggregatedUsageRepository,
    EntitlementSnapshotsRepository,
    DomainEventsRepository,
  ],
})
export class EntitlementsModule {}
