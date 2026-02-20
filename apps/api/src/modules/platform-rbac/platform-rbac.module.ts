import { Global, Module } from '@nestjs/common';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { DatabaseModule } from '../../database/database.module';
import { PlatformRolesRepository } from '../../repositories/platform-rbac/platform-roles.repository';
import { PlatformRbacSyncService } from './platform-rbac-sync.service';
import { PlatformRbacService } from './platform-rbac.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    PlatformRbacService,
    PlatformRbacSyncService,
    PlatformRolesRepository,
    PlatformPermissionsGuard,
  ],
  exports: [
    PlatformRbacService,
    PlatformRolesRepository,
    PlatformPermissionsGuard,
  ],
})
export class PlatformRbacModule {}
