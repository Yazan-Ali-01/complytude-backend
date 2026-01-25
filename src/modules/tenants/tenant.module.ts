import { Module } from '@nestjs/common';
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
import { DatabaseModule } from 'src/database/database.module';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';

@Module({
  imports: [DatabaseModule],
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
