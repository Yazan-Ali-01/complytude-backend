import { DatabaseService } from '@lib/database';
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
import { TEST_ADMIN_DATABASE } from '../setup/admin-database';

// Pre-hashed once at module level to avoid bcrypt cost per factory call
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('Test123!@#', 10);

export async function createTestUser(
  module: TestingModule,
  overrides?: Partial<CreateUserRow>,
): Promise<User> {
  const userRepository = module.get(UserRepository);
  // Fixtures are written as the superuser (RLS bypassed), through the real repository
  return module
    .get<DatabaseService>(TEST_ADMIN_DATABASE)
    .transaction((client) =>
      userRepository.create(
        {
          email: `test-${randomUUID().slice(0, 8)}@test.com`,
          password_hash: DEFAULT_PASSWORD_HASH,
          is_verified: true,
          ...overrides,
        },
        { client },
      ),
    );
}

export async function createTestUserInTenant(
  module: TestingModule,
  tenantId: string,
  overrides?: { role?: SystemTenantRole } & Partial<CreateUserRow>,
): Promise<{ user: User; userTenant: UserTenant }> {
  const { role, ...userOverrides } = overrides ?? {};

  const userRepository = module.get(UserRepository);
  const userTenantRepository = module.get(UserTenantRepository);

  return module
    .get<DatabaseService>(TEST_ADMIN_DATABASE)
    .transaction(async (client) => {
      const user = await userRepository.create(
        {
          email: `test-${randomUUID().slice(0, 8)}@test.com`,
          password_hash: DEFAULT_PASSWORD_HASH,
          is_verified: true,
          ...userOverrides,
        },
        { client },
      );
      const userTenant = await userTenantRepository.linkUserToTenant(
        { userId: user.id, tenantId, roleKey: role ?? SystemTenantRole.MEMBER },
        { client },
      );
      return { user, userTenant };
    });
}
