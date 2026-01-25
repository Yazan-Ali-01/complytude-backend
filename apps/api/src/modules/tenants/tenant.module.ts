import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantAdminController } from './admin.controller';
import { TenantOverridesAdminController } from './admin-overrides.controller';
import { TenantUsageAdminController } from './admin-usage.controller';
import { AdminFeaturesController } from './admin-features.controller';
import { FeaturesService } from './features.service';
import { OverridesService } from './overrides.service';
import { UsageTrackingService } from './usage-tracking.service';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { DatabaseModule, TenantRepository } from '@complytude/shared';
import { getEntitlementsConfig } from '../../config/entitlements.config';

@Module({
  imports: [
    DatabaseModule,
    CacheModule.register({
      ttl: getEntitlementsConfig().featuresCacheTtlMs, // milliseconds
      max: getEntitlementsConfig().maxCacheSize, // max cached entries
    }),
  ],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantOverridesAdminController,
    TenantUsageAdminController,
    AdminFeaturesController,
    CreditsController,
  ],
  providers: [
    TenantService,
    FeaturesService,
    OverridesService,
    UsageTrackingService,
    CreditsService,
    TenantRepository,
  ],
  exports: [
    TenantService,
    FeaturesService,
    OverridesService,
    UsageTrackingService,
    CreditsService,
    TenantRepository,
  ],
})
export class TenantModule {}
