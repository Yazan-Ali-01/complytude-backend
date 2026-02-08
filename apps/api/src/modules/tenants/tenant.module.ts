import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantInvitationsController } from './invitations.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [DatabaseModule, InvitationsModule],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantInvitationsController,
  ],
  providers: [TenantService, TenantRepository],
  exports: [TenantService, TenantRepository],
})
export class TenantModule {}
