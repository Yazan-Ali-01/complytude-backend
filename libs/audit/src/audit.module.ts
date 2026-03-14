import { DynamicModule, Global, Module } from '@nestjs/common';
import { AuditLogsRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Global()
@Module({})
export class AuditModule {
  static forRoot(): DynamicModule {
    return {
      module: AuditModule,
      imports: [],
      providers: [AuditService, AuditLogsRepository],
      exports: [AuditService],
    };
  }
}
