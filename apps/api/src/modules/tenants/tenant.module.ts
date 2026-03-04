import { Module } from '@nestjs/common';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { InvitationsModule } from '../invitations/invitations.module';
import { MockModule } from '../mock/mock.module';
import { TenantInvitationsController } from './invitations.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [
    InvitationsModule,
    MockModule, // ✅ Use mock module
  ],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantInvitationsController,
  ],
  providers: [
    TenantService,
    TenantRepository,
    // StorageService is provided by StorageMockModule, no need to re-declare
  ],
  exports: [TenantService, TenantRepository], // ✅ Export for other modules
})
export class TenantModule {}
