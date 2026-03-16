import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  CreateTenantRow,
  TenantRepository,
} from 'src/repositories/tenants/tenant.repository';
import { Tenant } from 'src/modules/tenants/entities/tenant.entity';

export async function createTestTenant(
  module: TestingModule,
  overrides?: Partial<CreateTenantRow>,
): Promise<Tenant> {
  const tenantRepository = module.get(TenantRepository);
  const suffix = randomUUID().slice(0, 8);
  return tenantRepository.create({
    name: overrides?.name ?? `Test Tenant ${suffix}`,
    slug: `test-${suffix}`,
    is_active: true,
    ...overrides,
  });
}
