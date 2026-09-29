import { Module } from '@nestjs/common';
import {
  AdminAuditLogsController,
  AuditLogsController,
} from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  controllers: [AuditLogsController, AdminAuditLogsController],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}
