import { Module } from '@nestjs/common';
import { AuditLogsRepository } from '../../repositories/audit/audit-logs.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [],
  providers: [AuditService, AuditLogsRepository],
  exports: [AuditService],
})
export class AuditModule {}
