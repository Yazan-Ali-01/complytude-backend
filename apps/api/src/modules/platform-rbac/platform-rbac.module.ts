import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { PlatformRolesRepository } from '../../repositories/platform-rbac/platform-roles.repository';
import { PlatformRbacService } from './platform-rbac.service';
import { PlatformRbacSyncService } from './platform-rbac-sync.service';

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
