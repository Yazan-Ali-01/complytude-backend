import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantAdminUserSessionsController } from './tenant-admin-user-sessions.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController, TenantAdminUserSessionsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
