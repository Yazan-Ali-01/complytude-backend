import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantAdminController } from './tenant-admin.controller';
import { FeaturesService } from './features.service';
import { UsageSchedulerService } from './usage-scheduler.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TenantController, TenantAdminController],
  providers: [TenantService, FeaturesService, UsageSchedulerService],
  exports: [TenantService, FeaturesService, UsageSchedulerService],
})
export class TenantModule {}
