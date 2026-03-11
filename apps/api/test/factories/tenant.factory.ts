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
  return tenantRepository.create({
    name: 'Test Tenant',
    slug: `test-${randomUUID().slice(0, 8)}`,
    is_active: true,
    ...overrides,
  });
}
