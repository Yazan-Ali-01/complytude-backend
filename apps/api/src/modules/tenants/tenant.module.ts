import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { FeaturesService } from './features.service';
import { UsageSchedulerService } from './usage-scheduler.service';
import { DatabaseModule } from 'src/database/database.module';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [TenantController, TenantAdminController],
  providers: [TenantService, FeaturesService, UsageSchedulerService, TenantRepository],
  exports: [TenantService, FeaturesService, UsageSchedulerService, TenantRepository],
})
export class TenantModule {}
