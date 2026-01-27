import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { InvitationRepository } from '../../repositories/invitations/invitation.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { UsersModule } from '../users/users.module';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  providers: [
    InvitationsService,
    InvitationRepository,
    UserRepository,
    UserTenantRepository,
  ],
  exports: [InvitationsService],
})
export class InvitationsModule {}
