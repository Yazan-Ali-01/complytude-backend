import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { TenantAdminController } from 'src/modules/tenants/admin.controller';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { AuditModule } from '../audit/audit.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantSessionsController } from './controllers/tenant-sessions.controller';
import { FeaturesService } from './features.service';
import { TenantInvitationsController } from './invitations.controller';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

/**
 * TenantModule - Multi-tenancy management
 *
 * Responsibilities:
 * - Tenant CRUD operations (create, read, update)
 * - Tenant feature management
 * - Tenant admin operations (system admin managing tenants)
 * - Tenant admin session management (tenant admins managing their users' sessions)
 *
 * Note: SessionService and SessionInvalidationService are provided by
 * SessionModule which is @Global(). No need to import AuthModule or SessionModule.
 *
 * Architecture: System admin session management moved to AuthModule
 * (AdminSessionsController now in auth/controllers/)
 */
@Module({
  imports: [DatabaseModule, InvitationsModule, AuditModule],
  controllers: [
    TenantController,
    TenantAdminController,
    TenantInvitationsController,
    TenantSessionsController,
    // AdminSessionsController removed - moved to AuthModule
    // (System-wide session management belongs to auth domain, not tenant domain)
  ],
  providers: [TenantService, FeaturesService, TenantRepository],
  exports: [TenantService, FeaturesService, TenantRepository],
})
export class TenantModule {}
