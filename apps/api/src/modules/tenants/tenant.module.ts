import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { InvitationsModule } from '../invitations/invitations.module';
import { AuditModule } from '../audit/audit.module';
import { FeaturesService } from './features.service';
import { TenantInvitationsController } from './invitations.controller';
import { TenantController } from './tenant.controller';
import { TenantSessionsController } from './controllers/tenant-sessions.controller';
import { AdminSessionsController } from './controllers/admin-sessions.controller';
import { TenantService } from './tenant.service';

/**
 * TenantModule - Multi-tenancy management
 *
 * Note: SessionService and SessionInvalidationService are provided by
 * SessionModule which is @Global(). No need to import AuthModule or SessionModule.
 */
@Module({
  imports: [DatabaseModule, InvitationsModule, AuditModule],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantInvitationsController,
    TenantSessionsController,
    AdminSessionsController,
  ],
  providers: [TenantService, FeaturesService, TenantRepository],
  exports: [TenantService, FeaturesService, TenantRepository],
})
export class TenantModule {}
