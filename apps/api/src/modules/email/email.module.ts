import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { EmailService } from './email.service';
import { TenantContactsService } from './tenant-contacts.service';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    TenantContactsService,
    TenantRepository,
    UserTenantRepository,
  ],
  exports: [EmailService, TenantContactsService],
})
export class EmailModule {}
