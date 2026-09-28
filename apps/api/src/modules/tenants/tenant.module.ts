import { SessionsModule } from '../auth/sessions.module';
import { Module } from '@nestjs/common';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { InvitationsModule } from '../invitations/invitations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantInvitationsController } from './invitations.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [InvitationsModule, SubscriptionsModule, SessionsModule],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantInvitationsController,
  ],
  providers: [
    TenantService,
    TenantRepository,
    UserRepository,
    UserTenantRepository,
    // StorageService is provided by StorageMockModule, no need to re-declare
  ],
  exports: [TenantService, TenantRepository], // ✅ Export for other modules
})
export class TenantModule {}
