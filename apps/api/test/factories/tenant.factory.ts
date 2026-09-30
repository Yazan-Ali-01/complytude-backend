import { DatabaseService } from '@lib/database';
import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  CreateTenantRow,
  TenantRepository,
} from 'src/repositories/tenants/tenant.repository';
import { Tenant } from 'src/modules/tenants/entities/tenant.entity';
import { TEST_ADMIN_DATABASE } from '../setup/admin-database';
import { AI_DISCLOSURE_VERSION } from 'src/common/constants/ai-disclosure.constant';

export async function createTestTenant(
  module: TestingModule,
  overrides?: Partial<CreateTenantRow>,
): Promise<Tenant> {
  const tenantRepository = module.get(TenantRepository);
  const suffix = randomUUID().slice(0, 8);
  // Fixtures are written as the superuser (RLS bypassed), through the real repository
  return module
    .get<DatabaseService>(TEST_ADMIN_DATABASE)
    .transaction((client) =>
      tenantRepository.create(
        {
          name: overrides?.name ?? `Test Tenant ${suffix}`,
          slug: `test-${suffix}`,
          is_active: true,
          ...overrides,
        },
        { client },
      ),
    );
}

/**
 * The organization's consent to AI processing, as the setup checkbox records it: contract analysis
 * and uploads are refused without it.
 */
export async function grantAiConsent(
  module: TestingModule,
  tenantId: string,
  version: string = AI_DISCLOSURE_VERSION,
): Promise<void> {
  await module
    .get<DatabaseService>(TEST_ADMIN_DATABASE)
    .query(
      `INSERT INTO public.tenant_ai_consents (tenant_id, disclosure_version) VALUES ($1, $2)`,
      [tenantId, version],
    );
}
