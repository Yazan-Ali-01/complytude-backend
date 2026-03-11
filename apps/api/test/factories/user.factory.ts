import * as bcrypt from 'bcrypt';
import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  CreateUserRow,
  UserRepository,
} from 'src/repositories/users/user.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { User } from 'src/modules/users/entities/user.entity';
import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';
import { SystemTenantRole } from 'src/common/types/tenant.types';

// Pre-hashed once at module level to avoid bcrypt cost per factory call
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('Test123!@#', 10);

export async function createTestUser(
  module: TestingModule,
  overrides?: Partial<CreateUserRow>,
): Promise<User> {
  const userRepository = module.get(UserRepository);
  return userRepository.create({
    email: `test-${randomUUID().slice(0, 8)}@test.com`,
    password_hash: DEFAULT_PASSWORD_HASH,
    is_verified: true,
    ...overrides,
  });
}

export async function createTestUserInTenant(
  module: TestingModule,
  tenantId: string,
  overrides?: { role?: SystemTenantRole } & Partial<CreateUserRow>,
): Promise<{ user: User; userTenant: UserTenant }> {
  const { role, ...userOverrides } = overrides ?? {};

  const userRepository = module.get(UserRepository);
  const userTenantRepository = module.get(UserTenantRepository);

  const user = await userRepository.create({
    email: `test-${randomUUID().slice(0, 8)}@test.com`,
    password_hash: DEFAULT_PASSWORD_HASH,
    is_verified: true,
    ...userOverrides,
  });

  const userTenant = await userTenantRepository.linkUserToTenant({
    userId: user.id,
    tenantId,
    roleKey: role ?? SystemTenantRole.MEMBER,
  });

  return { user, userTenant };
}
