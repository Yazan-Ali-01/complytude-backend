# E2E Testing Suite

Comprehensive end-to-end testing suite for the Complytude API with Swagger contract validation.

## Quick Start

```bash
# Start services
npm run docker:up:all

# Run migrations
npm run db:migrate

# Run all e2e tests
npm run test:e2e
```

## Directory Structure

```
test/
├── flows/                      # E2E flow test suites
│   ├── 01-authentication.e2e-spec.ts
│   ├── 02-multi-tenancy.e2e-spec.ts
│   ├── 03-storage.e2e-spec.ts
│   ├── 04-template-management.e2e-spec.ts
│   └── 05-plan-features.e2e-spec.ts
├── utils/                      # Testing utilities
│   ├── swagger-downloader.ts   # Download API spec
│   ├── swagger-validator.ts    # Schema validation
│   ├── test-context.ts         # App instance manager
│   ├── test-data-factory.ts    # Test data generation
│   ├── test-database.ts        # Database utilities
│   ├── assertions.ts           # Custom assertions
│   └── test-matchers.ts        # Jest matchers
├── swagger/                    # Swagger specifications
├── setup.ts                    # Global setup
├── teardown.ts                 # Global teardown
├── test.env                    # Test environment
├── jest-e2e.json              # Jest config
└── README.md                   # This file
```

## Available Commands

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Flow
```bash
npm run test:e2e:auth         # Authentication flow
npm run test:e2e:tenant       # Multi-tenancy flow
npm run test:e2e:storage      # Storage flow
npm run test:e2e:templates    # Template management
npm run test:e2e:features     # Plan features
```

### Other Options
```bash
npm run test:e2e:watch        # Watch mode
npm run test:e2e:coverage     # With coverage
npm run test:e2e:debug        # Debug mode
npm run test:swagger          # Download Swagger spec
```

## What Gets Tested

### ✅ Business Logic
- Authentication & authorization
- Multi-tenant data isolation
- Document upload limits (plan-based)
- RBAC permission enforcement
- Template versioning
- Feature flag access control

### ✅ Data Integrity
- Foreign key relationships
- Cascade delete operations
- Tenant schema isolation
- Audit trail consistency

### ✅ API Contract
- Swagger/OpenAPI schema validation
- Response structure verification
- Request validation
- HTTP status codes

### ✅ Error Scenarios
- Invalid authentication tokens
- Expired sessions
- Quota exceeded (403)
- Permission violations (403)
- Cross-tenant access (403/404)
- Invalid input data (400)

## Test Data Management

Tests use `TestDataFactory` to generate unique test data:

```typescript
import { TestDataFactory } from './utils/test-data-factory';

// Generate unique user
const user = TestDataFactory.createUser();

// Generate admin
const admin = TestDataFactory.createAdminUser();

// Generate tenant
const tenant = TestDataFactory.createTenant({ plan: 'pro' });
```

Test data is automatically cleaned up after tests complete.

## Swagger Contract Validation

All API responses are validated against the Swagger specification:

```typescript
import { validateSwaggerSchema } from './utils/assertions';

const response = await request(app.getHttpServer())
  .post('/api/auth/signup')
  .send(signupData);

// Validate response matches Swagger schema
validateSwaggerSchema('SignupResponse', response.body);
```

## Troubleshooting

### Database Not Running
```bash
npm run docker:up
```

### Port Conflict
Edit `test/test.env` and change the PORT value.

### Swagger Not Found
```bash
# Start server first
npm run start:dev

# Then download Swagger
npm run test:swagger
```

### Tests Timeout
Increase timeout in `jest-e2e.json`:
```json
{
  "testTimeout": 60000
}
```

## Documentation

See [TEST_FLOWS.md](../TEST_FLOWS.md) for comprehensive documentation including:
- Detailed test flow descriptions
- Setup instructions
- Troubleshooting guide
- CI/CD integration examples

## Best Practices

1. ✅ Use `TestDataFactory` for all test data
2. ✅ Clean up test data in `afterAll` hooks
3. ✅ Validate responses against Swagger schemas
4. ✅ Test both success and error scenarios
5. ✅ Keep tests isolated and independent
6. ✅ Use descriptive test names
7. ✅ Verify database state, not just API responses

## Contributing

When adding new tests:

1. Create test file in `flows/` with sequential prefix
2. Use existing patterns and utilities
3. Include comprehensive validations
4. Test error scenarios
5. Clean up test data
6. Add npm script to `package.json`
7. Update documentation

---

For more information, see [TEST_FLOWS.md](../TEST_FLOWS.md)

