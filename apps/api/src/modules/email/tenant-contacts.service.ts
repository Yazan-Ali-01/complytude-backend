import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';

/** Who a tenant's notifications go to, and in which language. */
export interface TenantContacts {
  tenantName: string;
  locale: string;
  /** The first tenant admin and the billing email, deduplicated; may be empty. */
  recipients: string[];
}

/**
 * Resolves a tenant's notification contacts for background jobs, which run without a tenant
 * context (read as platform admin).
 */
@Injectable()
export class TenantContactsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly userTenantRepository: UserTenantRepository,
  ) {}

  async resolve(tenantId: string): Promise<TenantContacts | null> {
    return this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        const tenant = await this.tenantRepository.findById(tenantId, {
          client,
        });
        if (!tenant) return null;
        const adminEmail = await this.userTenantRepository.findTenantAdminEmail(
          tenantId,
          { client },
        );
        return {
          tenantName: tenant.name ?? '',
          locale: tenant.locale ?? 'en',
          recipients: [
            ...new Set(
              [adminEmail, tenant.billing_email].filter(
                (email): email is string => !!email,
              ),
            ),
          ],
        };
      },
    );
  }
}
