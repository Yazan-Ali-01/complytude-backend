import { Module, Global } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { PermissionsController } from './controllers/permissions.controller';
import { PermissionsService } from './services/permissions.service';
import { RbacService } from './services/rbac.service';
import { PermissionsRepository } from './repositories/permissions.repository';
import { RolePermissionsRepository } from './repositories/role-permissions.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    RbacService,
    PermissionsRepository,
    RolePermissionsRepository,
    UserTenantRepository,
  ],
  exports: [RbacService, PermissionsService],
})
export class RbacModule {}
