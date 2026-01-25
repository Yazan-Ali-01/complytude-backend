# System Admin Testing Guide

## Overview

This guide documents the correct pattern for testing system admin functionality in E2E tests. System admin tests require special handling due to database connection pool isolation between the test suite and the running application.

## The Problem

When running E2E tests, there are **two separate database connection pools**:

1. **App's DatabaseService** - Used by the NestJS application
2. **Test's Database Pool** - Used by direct test database queries

Changes made via one pool are not immediately visible to the other pool due to PostgreSQL transaction isolation.

## The Solution: Shared DatabaseService

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Test Suite                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────────┐    │
│  │  Test Code       │         │  NestJS App          │    │
│  │                  │         │                      │    │
│  │  TestDatabase ───┼────┐    │  ┌────────────────┐ │    │
│  │  (static class)  │    │    │  │ DatabaseService│ │    │
│  └──────────────────┘    │    │  └────────┬───────┘ │    │
│                          │    │           │         │    │
│                          │    │           │         │    │
│                          │    └───────────┼─────────┘    │
│                          │                │              │
│                          └────────────────┘              │
│                                   │                      │
│                          SHARED CONNECTION POOL          │
│                                   │                      │
└───────────────────────────────────┼──────────────────────┘
                                    ▼
                          ┌─────────────────┐
                          │   PostgreSQL    │
                          └─────────────────┘
```

### Implementation

#### 1. TestDatabase Class (test/utils/test-database.ts)

```typescript
export class TestDatabase {
  private static pool: Pool;  // For cleanup operations
  private static appDatabaseService: DatabaseService | null = null;  // Shared with app

  /**
   * Set the app's DatabaseService for shared connection pool
   */
  static setAppDatabaseService(service: DatabaseService): void {
    this.appDatabaseService = service;
  }

  /**
   * Set user as system admin (uses shared DatabaseService)
   */
  static async setSystemAdmin(userId: string, isAdmin = true): Promise<void> {
    if (!this.appDatabaseService) {
      throw new Error('App DatabaseService not set...');
    }

    // Use app's DatabaseService - changes immediately visible!
    const updateResult = await this.appDatabaseService.query(
      'UPDATE public.users SET is_system_admin = $1 WHERE id = $2',
      [isAdmin, userId],
    );
  }
}
```

#### 2. TestContext Injection (test/utils/test-context.ts)

```typescript
async initialize(): Promise<NestFastifyApplication> {
  // ... create app ...
  
  // Inject app's DatabaseService into TestDatabase
  const databaseService = this.app.get(DatabaseService);
  TestDatabase.setAppDatabaseService(databaseService);
  
  return this.app;
}
```

## Testing System Admin Functionality

### Correct Pattern

```typescript
describe('Admin Feature Tests', () => {
  let app: INestApplication;
  let systemAdminToken: string;
  let systemAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();  // App DatabaseService injected automatically

    // 1. Create user via API
    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: 'admin@test.com',
        password: 'Admin@Pass123!',
        firstName: 'Admin',
        lastName: 'User',
        tenantName: 'Admin Tenant',
      })
      .expect(201);

    systemAdminId = signupRes.body.userId;

    // 2. Verify email
    const verificationToken =
      signupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken('admin@test.com'));
    if (verificationToken) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken });
    }

    // 3. Set as system admin BEFORE login (uses shared DatabaseService)
    await TestDatabase.setSystemAdmin(systemAdminId, true);

    // 4. Login AFTER setting system admin
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'Admin@Pass123!',
      })
      .expect(200);

    systemAdminToken = loginRes.body.accessToken;
  });

  it('should access system admin endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/some-action')
      .set('Authorization', `Bearer ${systemAdminToken}`)
      .expect(200);  // ✅ Works because JWT has isSystemAdmin: true
  });
});
```

### ❌ INCORRECT Pattern (Old Approach)

```typescript
// DON'T DO THIS - Creates separate pool with transaction isolation issues
beforeAll(async () => {
  // ...
  
  // ❌ Wrong: Uses TestDatabase.query() which has separate pool
  await TestDatabase.query(
    'UPDATE public.users SET is_system_admin = $1 WHERE id = $2',
    [true, userId]
  );
  
  // User not found or update not visible!
  const loginRes = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password });
    
  // ❌ JWT will have isSystemAdmin: false
});
```

## Key Points

### ✅ Do's

1. **Always use `TestDatabase.setSystemAdmin()`** - It uses the shared DatabaseService
2. **Set system admin BEFORE login** - JWT is generated with current DB state
3. **Verify email before login** - Required by authentication flow
4. **Use `createTestApp()`** - Automatically injects DatabaseService
5. **Don't close app in individual test files** - Use global teardown

### ❌ Don'ts

1. **Don't use separate database connections** for operations that need app visibility
2. **Don't set system admin AFTER getting JWT** - Token already generated
3. **Don't add arbitrary delays** - Use shared pool instead
4. **Don't close app in `afterAll`** - App is singleton across test files

## Debugging

### Check if DatabaseService is Injected

```typescript
beforeAll(async () => {
  app = await createTestApp();
  
  // Verify injection (TestDatabase will throw if not set)
  try {
    await TestDatabase.setSystemAdmin('test-user-id', true);
  } catch (error) {
    console.error('DatabaseService not injected:', error);
  }
});
```

### Verify JWT Token Content

```typescript
const tokenParts = accessToken.split('.');
const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
console.log('JWT Payload:', payload);
// Should show: { ..., isSystemAdmin: true, ... }
```

### Check Connection Pool Health

```typescript
import { ConnectionPoolHealthCheck } from '../utils/health-checks';

beforeAll(async () => {
  const dbService = app.get(DatabaseService);
  await ConnectionPoolHealthCheck.runAll(dbService);
});
```

## Examples

### Example 1: Creating System Admin User

```typescript
it('should create and authenticate system admin', async () => {
  const adminData = {
    email: TestDataFactory.generateEmail('sysadmin'),
    password: 'SysAdmin@Pass123!',
    firstName: 'System',
    lastName: 'Admin',
    tenantName: TestDataFactory.generateTenantName('sysadmin'),
  };

  // 1. Signup
  const signupRes = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send(adminData)
    .expect(201);

  const userId = signupRes.body.userId;

  // 2. Verify email
  const token = await TestDatabase.getVerificationToken(adminData.email);
  if (token) {
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);
  }

  // 3. Promote to system admin
  await TestDatabase.setSystemAdmin(userId, true);

  // 4. Login
  const loginRes = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({
      email: adminData.email,
      password: adminData.password,
    })
    .expect(200);

  // 5. Verify system admin access
  expect(loginRes.body.accessToken).toBeDefined();
  
  await request(app.getHttpServer())
    .get('/api/admin/tenants')
    .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
    .expect(200);
});
```

### Example 2: Testing System Admin-Only Endpoints

```typescript
describe('System Admin Endpoints', () => {
  let adminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    // Create system admin (as shown above)
    adminToken = await createSystemAdminAndLogin();
    
    // Create regular user
    regularUserToken = await createRegularUserAndLogin();
  });

  it('should allow system admin to update tenant plans', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/tenants/some-tenant-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ plan: 'enterprise' })
      .expect(200);
  });

  it('should deny regular user from updating tenant plans', async () => {
    await request(app.getHttpServer())
      .put('/api/admin/tenants/some-tenant-id')
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ plan: 'enterprise' })
      .expect(403);  // Forbidden
  });
});
```

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden on admin endpoints | JWT doesn't have `isSystemAdmin: true` | Set system admin BEFORE login |
| User not found errors | Transaction isolation | Use `TestDatabase.setSystemAdmin()` |
| Flaky tests | Race conditions | Use shared DatabaseService |
| Tests pass individually but fail in suite | App closed too early | Don't close app in test `afterAll` |

## See Also

- [Test Context](./test-context.ts) - App initialization and DatabaseService injection
- [Test Database](./test-database.ts) - Shared database operations
- [Health Checks](./health-checks.ts) - Connection pool verification
- [Authentication E2E Tests](../flows/01-authentication.e2e-spec.ts) - Working examples

## References

- [NestJS Testing Documentation](https://docs.nestjs.com/fundamentals/testing)
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Connection Pooling Best Practices](https://node-postgres.com/features/pooling)

