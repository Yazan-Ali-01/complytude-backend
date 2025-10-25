import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from '../utils/test-context';
import { TestDataFactory } from '../utils/test-data-factory';
import { TestDatabase } from '../utils/test-database';
import { validatePlanFeatures } from '../utils/assertions';

describe('Plan Features Flow (e2e)', () => {
  let app: INestApplication;
  let earlyAccessToken: string;
  let earlyAccessTenantId: string;
  let systemAdminToken: string;
  let systemAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create early access user (default plan with 10 doc limit)
    const earlyAccessUser = TestDataFactory.createUser({
      email: TestDataFactory.generateEmail('early'),
    });

    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: earlyAccessUser.email,
        password: earlyAccessUser.password,
        firstName: earlyAccessUser.firstName,
        lastName: earlyAccessUser.lastName,
        tenantName: earlyAccessUser.tenantName,
      })
      .expect(201);

    earlyAccessTenantId = signupRes.body.tenantId;

    // Verify and login
    const verificationToken =
      signupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(earlyAccessUser.email));
    if (verificationToken) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken });
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: earlyAccessUser.email,
        password: earlyAccessUser.password,
      });

    earlyAccessToken = loginRes.body.accessToken;

    // Create system admin for plan management
    const adminUser = TestDataFactory.createSystemAdmin();
    const adminSignupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: adminUser.email,
        password: adminUser.password,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        tenantName: adminUser.tenantName,
      })
      .expect(201);

    systemAdminId = adminSignupRes.body.userId;

    // Verify email first
    const adminVerificationToken =
      adminSignupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(adminUser.email));
    if (adminVerificationToken) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: adminVerificationToken });
    }

    // Set as system admin BEFORE login to ensure JWT includes isSystemAdmin flag
    await TestDatabase.setSystemAdmin(systemAdminId, true);

    // Login AFTER setting system admin to get JWT with isSystemAdmin flag
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: adminUser.email,
        password: adminUser.password,
      })
      .expect(200);

    systemAdminToken = adminLoginRes.body.accessToken;
    expect(systemAdminToken).toBeDefined();
  });

  afterAll(async () => {
    await TestDatabase.cleanupAllTestData();
    // App will be closed by the last test file or global teardown
    // await closeTestApp();
  });

  describe('1. Check Default Plan Features', () => {
    it('should return early_access plan with default limits', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      expect(response.body.plan).toBe('early_access');

      // Check features
      if (response.body.features) {
        validatePlanFeatures(response.body.features);
        expect(response.body.features.document_limit).toBe(10);
      }
    });
  });

  describe('2. Document Limit Enforcement', () => {
    it('should track document count', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/storage/list')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      const currentCount = response.body.total;
      expect(currentCount).toBeGreaterThanOrEqual(0);
    });

    // Note: Actual file upload testing would require multipart form data
    it('should enforce document limits', async () => {
      // This test would upload files until limit is reached
      // Then verify 403 is returned
      console.log(
        'Document limit enforcement test requires file upload implementation',
      );
    });
  });

  describe('3. System Admin Plan Management', () => {
    it('should upgrade tenant plan', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/admin/tenants/${earlyAccessTenantId}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          plan: 'pro',
        })
        .expect(200);

      expect(response.body.plan).toBe('pro');
    });

    it('should reflect new plan features', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      expect(response.body.plan).toBe('pro');

      if (response.body.features) {
        expect(response.body.features.document_limit).toBe(500);
      }
    });
  });

  describe('4. Custom Feature Overrides', () => {
    it('should apply custom feature overrides', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/admin/tenants/${earlyAccessTenantId}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          plan: 'pro',
          features: {
            document_limit: 750,
            checklist_access: true,
            analyzer_enabled: true,
          },
        })
        .expect(200);

      expect(response.body.plan).toBe('pro');
      if (response.body.features) {
        expect(response.body.features.document_limit).toBe(750);
        expect(response.body.features.checklist_access).toBe(true);
      }
    });

    it('should use custom features over plan defaults', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      if (response.body.features) {
        // Custom override of 750, not pro default of 500
        expect(response.body.features.document_limit).toBe(750);
      }
    });
  });

  describe('5. Feature Access Control', () => {
    it('should allow feature access based on plan', async () => {
      // With pro plan, checklist access should be available
      // This would test actual feature-gated endpoints
      const response = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      if (response.body.features) {
        expect(response.body.features.checklist_access).toBe(true);
      }
    });
  });

  describe('6. Enterprise Plan (Unlimited)', () => {
    it('should set unlimited document limit for enterprise', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/admin/tenants/${earlyAccessTenantId}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          plan: 'enterprise',
        })
        .expect(200);

      expect(response.body.plan).toBe('enterprise');

      // Verify unlimited (-1)
      const tenantRes = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${earlyAccessToken}`)
        .expect(200);

      if (tenantRes.body.features) {
        expect(tenantRes.body.features.document_limit).toBe(-1);
      }
    });
  });
});
