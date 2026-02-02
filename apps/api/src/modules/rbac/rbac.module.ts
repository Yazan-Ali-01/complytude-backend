import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PermissionsRepository } from '../../repositories/rbac/permissions.repository';
import { RolesRepository } from '../../repositories/rbac/roles.repository';
import { RbacService } from './rbac.service';

@Module({
  imports: [DatabaseModule],
  providers: [RbacService, RolesRepository, PermissionsRepository],
  exports: [RbacService, RolesRepository, PermissionsRepository],
})
export class RbacModule {}
