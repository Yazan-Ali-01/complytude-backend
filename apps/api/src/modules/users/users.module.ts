import { Module, forwardRef } from '@nestjs/common';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { AuthModule } from '../auth/auth.module';
import { TenantAdminUserSessionsController } from './tenant-admin-user-sessions.controller';
import { TenantMembersController } from './tenant-members.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [
    UsersController,
    TenantMembersController,
    TenantAdminUserSessionsController,
  ],
  providers: [
    UsersService,
    UserRepository,
    UserTenantRepository,
    TenantRepository,
  ],
  exports: [UsersService],
})
export class UsersModule {}
