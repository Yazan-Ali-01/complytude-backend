import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantAdminController } from './tenant-admin.controller';
import { FeaturesService } from './features.service';
import { DatabaseModule } from '../../database/database.module';
import { I18nModule } from '../../i18n/i18n.module';

@Module({
  imports: [DatabaseModule, I18nModule],
  controllers: [TenantController, TenantAdminController],
  providers: [TenantService, FeaturesService],
  exports: [TenantService, FeaturesService],
})
export class TenantModule {}
