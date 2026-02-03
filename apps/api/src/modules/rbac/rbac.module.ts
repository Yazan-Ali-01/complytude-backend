import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DatabaseModule } from '../../database/database.module';
import { PermissionsRepository } from '../../repositories/rbac/permissions.repository';
import { RolesRepository } from '../../repositories/rbac/roles.repository';
import { RbacService } from './rbac.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    RbacService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
  exports: [
    RbacService,
    RolesRepository,
    PermissionsRepository,
    PermissionsGuard,
  ],
})
export class RbacModule {}
