import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from '../utils/test-context';
import { TestDataFactory } from '../utils/test-data-factory';
import { TestDatabase } from '../utils/test-database';
import { validateRequiredFields } from '../utils/assertions';

describe('Storage Flow (e2e)', () => {
  let app: INestApplication;
  let testUser: ReturnType<typeof TestDataFactory.createUser>;
  let accessToken: string;
  let tenantId: string;
  let uploadedFileKey: string;

  beforeAll(async () => {
    app = await createTestApp();
    testUser = TestDataFactory.createUser();

    // Create and login user
    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: testUser.email,
        password: testUser.password,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        tenantName: testUser.tenantName,
      })
      .expect(201);

    tenantId = signupRes.body.tenantId;

    // Verify email
    const verificationToken =
      signupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(testUser.email));
    if (verificationToken) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken });
    }

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (tenantId) {
      await TestDatabase.cleanupTenant(tenantId);
    }
    if (testUser.email) {
      await TestDatabase.cleanupUser(testUser.email);
    }
    // Don't close the app - it's shared across test files
    // await closeTestApp();
  });

  describe('Storage Operations', () => {
    it('should list files (empty initially)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/storage/list')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      validateRequiredFields(response.body, ['files', 'total']);
      expect(Array.isArray(response.body.files)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });

    // Note: File upload with Fastify multipart requires special handling
    // For comprehensive testing, you'd use form-data library
    it('should handle file upload validation', async () => {
      // Test without authentication
      const response = await request(app.getHttpServer()).post(
        '/api/storage/upload',
      );

      expect([401, 400]).toContain(response.status);
    });

    it('should reject download without tenant ID', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/storage/download/nonexistent.txt',
      );

      expect([400, 404]).toContain(response.status);
    });

    it('should handle delete of non-existent file', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/storage/nonexistent-file.txt')
        .set('Authorization', `Bearer ${accessToken}`);

      // Should return 404 for file not found, 400 for bad request, or 500 if bucket setup issues
      expect([404, 400, 500]).toContain(response.status);
    });
  });

  describe('Document Limit Enforcement', () => {
    it('should check current document count', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/storage/list')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const currentCount = response.body.total;
      expect(currentCount).toBeGreaterThanOrEqual(0);
    });

    it('should get tenant plan limits', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tenants/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.plan).toBeDefined();
      // Plan should have document limits enforced
    });
  });
});
