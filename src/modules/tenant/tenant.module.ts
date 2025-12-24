import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantAdminController } from './tenant-admin.controller';
import { FeaturesService } from './features.service';
import { DatabaseModule } from '../../database/database.module';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [TenantController, TenantAdminController],
  providers: [TenantService, FeaturesService, TenantRepository],
  exports: [TenantService, FeaturesService, TenantRepository],
})
export class TenantModule {}
