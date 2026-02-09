import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule - User management
 *
 * Note: SessionInvalidationService is provided by SessionModule which is @Global().
 * No need to import AuthModule or SessionModule.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
