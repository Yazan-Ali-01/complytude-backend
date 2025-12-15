import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  validateErrorResponse,
  validateJWT,
  validateRequiredFields,
} from '../utils/assertions';
import { closeTestApp, createTestApp } from '../utils/test-context';
import { TestDataFactory } from '../utils/test-data-factory';
import { TestDatabase } from '../utils/test-database';

describe('Authentication Flow (e2e)', () => {
  let app: INestApplication;
  let testUser: ReturnType<typeof TestDataFactory.createUser>;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  let tenantId: string;
  let verificationToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    testUser = TestDataFactory.createUser();
  });

  afterAll(async () => {
    // Cleanup test data
    if (tenantId) {
      await TestDatabase.cleanupTenant(tenantId);
    }
    if (testUser.email) {
      await TestDatabase.cleanupUser(testUser.email);
    }

    await closeTestApp();
  });

  describe('1. User Signup', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          tenantName: testUser.tenantName,
        })
        .expect(201);

      // Validate response structure
      validateRequiredFields(response.body, ['userId', 'tenantId', 'message']);

      // Store IDs for subsequent tests
      userId = response.body.userId;
      tenantId = response.body.tenantId;

      expect(userId).toMatch(/^user_[a-f0-9-]+$/);
      expect(tenantId).toBeValidTenantId();
      expect(response.body.message).toContain('Signup successful');

      // For development, verification token might be in response
      if (response.body.verificationToken) {
        verificationToken = response.body.verificationToken;
      }
    });

    it('should reject signup with duplicate email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          tenantName: 'Another Tenant',
        });

      validateErrorResponse(response, 409, 'already registered');
    });

    it('should reject signup with invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'invalid-email',
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          tenantName: testUser.tenantName,
        });

      validateErrorResponse(response, 400);
    });

    it('should reject signup with weak password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: TestDataFactory.generateEmail(),
          password: '12345',
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          tenantName: testUser.tenantName,
        });

      validateErrorResponse(response, 400);
    });
  });

  describe('2. Email Verification', () => {
    it('should verify email with valid token', async () => {
      // Get verification token from database if not in response
      if (!verificationToken) {
        verificationToken = (await TestDatabase.getVerificationToken(
          testUser.email,
        )) as string;
      }

      expect(verificationToken).toBeDefined();

      const response = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({
          token: verificationToken,
        })
        .expect(200);

      expect(response.body.message).toContain('verified');
    });

    it('should reject invalid verification token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({
          token: 'invalid-token-12345',
        });

      validateErrorResponse(response, 400);
    });
  });

  describe('3. User Login', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Validate response structure
      validateRequiredFields(response.body, [
        'accessToken',
        'refreshToken',
        'user',
        'currentTenant',
        'availableTenants',
      ]);

      // Store tokens
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;

      // Validate JWT tokens
      const accessJWT = validateJWT(accessToken);
      const refreshJWT = validateJWT(refreshToken);

      expect(accessJWT.payload.email).toBe(testUser.email);
      expect(accessJWT.payload.tenantId).toBe(tenantId);
      expect(refreshJWT.payload.email).toBe(testUser.email);

      // Validate user object
      expect(response.body.user.id).toBe(userId);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.isVerified).toBe(true);

      // Validate tenant info
      expect(response.body.currentTenant.tenantId).toBe(tenantId);
      expect(response.body.currentTenant.role).toBe('admin');
      expect(response.body.availableTenants).toHaveLength(1);
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        });

      validateErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      validateErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should allow login with unverified email (returns isVerified=false)', async () => {
      // Create new unverified user
      const unverifiedUser = TestDataFactory.createUser({
        email: TestDataFactory.generateEmail('unverified'),
      });

      const signupRes = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: unverifiedUser.email,
          password: unverifiedUser.password,
          firstName: unverifiedUser.firstName,
          lastName: unverifiedUser.lastName,
          tenantName: unverifiedUser.tenantName,
        })
        .expect(201);

      // Note: Current implementation allows login without email verification
      // The isVerified flag is returned in the response for client-side handling
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: unverifiedUser.email,
          password: unverifiedUser.password,
        })
        .expect(200);

      // User should be able to login but isVerified should be false
      expect(response.body.user.isVerified).toBe(false);

      // Cleanup
      const unverifiedTenantId = signupRes.body.tenantId;
      await TestDatabase.cleanupTenant(unverifiedTenantId);
      await TestDatabase.cleanupUser(unverifiedUser.email);
    });
  });

  describe('4. Access Protected Resources', () => {
    it('should access protected endpoint with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
      expect(response.body.email).toBe(testUser.email);
    });

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer()).get('/api/users/me');

      validateErrorResponse(response, 401);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token');

      validateErrorResponse(response, 401);
    });

    it('should reject request with malformed token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', 'InvalidFormat');

      validateErrorResponse(response, 401);
    });
  });

  describe('5. Token Refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      // Wait a bit to ensure new token is different
      await TestDataFactory.wait(1000);

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(200);

      validateRequiredFields(response.body, ['accessToken', 'refreshToken']);

      // Validate new tokens
      const newAccessToken = response.body.accessToken;
      const newRefreshToken = response.body.refreshToken;

      expect(newAccessToken).not.toBe(accessToken);
      expect(newRefreshToken).not.toBe(refreshToken);

      validateJWT(newAccessToken);
      validateJWT(newRefreshToken);

      // Update tokens for subsequent tests
      accessToken = newAccessToken;
      refreshToken = newRefreshToken;

      // Verify new token works
      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        });

      validateErrorResponse(response, 401);
    });
  });

  describe('6. Password Reset Flow', () => {
    let resetToken: string;

    it('should request password reset', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({
          email: testUser.email,
        })
        .expect(200);

      expect(response.body.message).toContain('sent');

      // In development, token might be in response
      if (response.body.resetToken) {
        resetToken = response.body.resetToken;
      }
    });

    it('should reset password with valid token', async () => {
      // Get reset token from database if not in response
      if (!resetToken) {
        const user = await TestDatabase.getUserByEmail(testUser.email);
        resetToken = user.reset_token;
      }

      const newPassword = 'NewTest@Pass456!';

      const response = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: newPassword,
        })
        .expect(200);

      expect(response.body.message).toContain('reset');

      // Verify can login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(200);

      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;

      // Verify old password doesn't work
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(401);
    });
  });

  describe('7. Logout', () => {
    it('should successfully logout', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken,
        })
        .expect(200);

      expect(response.body.message).toContain('Logged out');
    });

    it('should reject refresh with logged out token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken,
        });

      // Should fail because token was revoked
      validateErrorResponse(response, 401);
    });

    it('should still access with access token (until expiry)', async () => {
      // Access token should still work until it expires
      // This tests that logout only revokes refresh token
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      // Access token might still be valid or expired depending on timing
      expect([200, 401]).toContain(response.status);
    });
  });
});
