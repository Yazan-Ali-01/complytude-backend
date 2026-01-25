import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditController } from './controllers/audit.controller';
import { AuditService } from '../rbac/services/audit.service';
import { AuditRepository } from '../rbac/repositories/audit.repository';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}