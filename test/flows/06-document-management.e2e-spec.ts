/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../utils/test-context';
import { TestDataFactory } from '../utils/test-data-factory';
import { TestDatabase } from '../utils/test-database';
import { validateRequiredFields } from '../utils/assertions';

describe('Document Management Flow (e2e)', () => {
  let app: INestApplication;
  let tenant1User: ReturnType<typeof TestDataFactory.createUser>;
  let tenant2User: ReturnType<typeof TestDataFactory.createUser>;
  let tenant1AccessToken: string;
  let tenant2AccessToken: string;
  let tenant1Id: string;
  let tenant2Id: string;
  let tenant1Schema: string;
  let tenant2Schema: string;
  let testDocumentId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create two separate tenants for testing isolation
    tenant1User = TestDataFactory.createUser();
    tenant2User = TestDataFactory.createUser();

    // Signup Tenant 1 User
    const tenant1SignupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: tenant1User.email,
        password: tenant1User.password,
        firstName: tenant1User.firstName,
        lastName: tenant1User.lastName,
        tenantName: tenant1User.tenantName,
      })
      .expect(201);

    tenant1Id = tenant1SignupRes.body.tenantId;

    // Get tenant 1 schema name
    const tenant1Data = await TestDatabase.getTenantById(tenant1Id);
    tenant1Schema = tenant1Data.schema_name;

    // Verify email for tenant 1
    const verificationToken1 =
      tenant1SignupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(tenant1User.email));
    if (verificationToken1) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken1 });
    }

    // Login Tenant 1 User
    const tenant1LoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: tenant1User.email,
        password: tenant1User.password,
      });

    tenant1AccessToken = tenant1LoginRes.body.accessToken;

    // Signup Tenant 2 User
    const tenant2SignupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: tenant2User.email,
        password: tenant2User.password,
        firstName: tenant2User.firstName,
        lastName: tenant2User.lastName,
        tenantName: tenant2User.tenantName,
      })
      .expect(201);

    tenant2Id = tenant2SignupRes.body.tenantId;

    // Get tenant 2 schema name
    const tenant2Data = await TestDatabase.getTenantById(tenant2Id);
    tenant2Schema = tenant2Data.schema_name;

    // Verify email for tenant 2
    const verificationToken2 =
      tenant2SignupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(tenant2User.email));
    if (verificationToken2) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken2 });
    }

    // Login Tenant 2 User
    const tenant2LoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: tenant2User.email,
        password: tenant2User.password,
      });

    tenant2AccessToken = tenant2LoginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    if (tenant1Id) {
      await TestDatabase.cleanupTenant(tenant1Id);
    }
    if (tenant2Id) {
      await TestDatabase.cleanupTenant(tenant2Id);
    }
    if (tenant1User.email) {
      await TestDatabase.cleanupUser(tenant1User.email);
    }
    if (tenant2User.email) {
      await TestDatabase.cleanupUser(tenant2User.email);
    }
  });

  describe('GET /documents - List Documents', () => {
    it('should list documents (empty initially)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      validateRequiredFields(response.body, [
        'documents',
        'total',
        'page',
        'limit',
      ]);
      expect(Array.isArray(response.body.documents)).toBe(true);
      expect(response.body.total).toBe(0);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(50);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/documents').expect(401);
    });

    it('should accept pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents?page=2&limit=10')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.page).toBe(2);
      expect(response.body.limit).toBe(10);
    });

    it('should accept filter parameters', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/api/documents?templateKey=test_template&startDate=2024-01-01T00:00:00.000Z&endDate=2024-12-31T23:59:59.999Z',
        )
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('documents');
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('Document Operations with Test Data', () => {
    beforeAll(async () => {
      // Create test documents in tenant 1 schema
      const docId1 = `doc_test_${Date.now()}_1`;
      const docId2 = `doc_test_${Date.now()}_2`;
      const docId3 = `doc_test_${Date.now()}_3`;

      await TestDatabase.query(
        `INSERT INTO ${tenant1Schema}.documents (id, tenant_id, title, content, metadata, created_by, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '2 days')`,
        [
          docId1,
          tenant1Id,
          'Test Contract 1',
          'This is test contract content',
          JSON.stringify({
            templateKey: 'employment_contract',
            templateId: 'template_123',
            filename: 'contract_1.pdf',
            size: 102400,
            contentType: 'application/pdf',
            generatedAt: new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            variables: { companyName: 'Test Corp', employeeName: 'John Doe' },
          }),
          'user_test_1',
        ],
      );

      await TestDatabase.query(
        `INSERT INTO ${tenant1Schema}.documents (id, tenant_id, title, content, metadata, created_by, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 day')`,
        [
          docId2,
          tenant1Id,
          'Test NDA 1',
          'This is test NDA content',
          JSON.stringify({
            templateKey: 'nda_agreement',
            templateId: 'template_456',
            filename: 'nda_1.pdf',
            size: 51200,
            contentType: 'application/pdf',
            generatedAt: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            variables: { party1: 'Test Corp', party2: 'Vendor Inc' },
          }),
          'user_test_1',
        ],
      );

      await TestDatabase.query(
        `INSERT INTO ${tenant1Schema}.documents (id, tenant_id, title, content, metadata, created_by, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          docId3,
          tenant1Id,
          'Test Contract 2',
          'This is another test contract',
          JSON.stringify({
            templateKey: 'employment_contract',
            templateId: 'template_123',
            filename: 'contract_2.pdf',
            size: 204800,
            contentType: 'application/pdf',
            generatedAt: new Date().toISOString(),
            variables: { companyName: 'Test Corp', employeeName: 'Jane Smith' },
          }),
          'user_test_1',
        ],
      );

      testDocumentId = docId1;

      // Create a document in tenant 2 schema for isolation testing
      await TestDatabase.query(
        `INSERT INTO ${tenant2Schema}.documents (id, tenant_id, title, content, metadata, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `doc_test_tenant2_${Date.now()}`,
          tenant2Id,
          'Tenant 2 Document',
          'This belongs to tenant 2',
          JSON.stringify({
            templateKey: 'confidential_doc',
            templateId: 'template_789',
            filename: 'tenant2_doc.pdf',
            size: 81920,
            contentType: 'application/pdf',
          }),
          'user_test_2',
        ],
      );
    });

    it('should list all documents for tenant 1', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.documents).toHaveLength(3);
      expect(response.body.documents[0]).not.toHaveProperty('content'); // Content excluded in list view
    });

    it('should filter by templateKey', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents?templateKey=employment_contract')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(2);
      expect(response.body.documents).toHaveLength(2);
      response.body.documents.forEach((doc: any) => {
        expect(doc.metadata.templateKey).toBe('employment_contract');
      });
    });

    it('should filter by date range', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .get(
          `/api/documents?startDate=${twoDaysAgo.toISOString()}&endDate=${oneDayFromNow.toISOString()}`,
        )
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(3);
    });

    it('should filter by date range (narrow)', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .get(
          `/api/documents?startDate=${threeDaysAgo.toISOString()}&endDate=${twoDaysAgo.toISOString()}`,
        )
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents?page=1&limit=2')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.documents).toHaveLength(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
    });
  });

  describe('GET /documents/:id - Get Single Document', () => {
    it('should get document with full details including content', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      validateRequiredFields(response.body, [
        'id',
        'tenantId',
        'title',
        'metadata',
        'createdAt',
        'updatedAt',
      ]);
      expect(response.body.id).toBe(testDocumentId);
      expect(response.body.content).toBeDefined(); // Content included in single view
      expect(response.body.metadata.templateKey).toBe('employment_contract');
      expect(response.body.metadata.variables).toBeDefined();
    });

    it('should return 404 for non-existent document', async () => {
      await request(app.getHttpServer())
        .get('/api/documents/doc_nonexistent_12345')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/documents/${testDocumentId}`)
        .expect(401);
    });
  });

  describe('Tenant Isolation', () => {
    it('should not allow tenant 1 user to access tenant 2 documents', async () => {
      // Get tenant 2's document ID
      const tenant2DocsResult = await TestDatabase.query(
        `SELECT id FROM ${tenant2Schema}.documents LIMIT 1`,
      );

      if (tenant2DocsResult.rows.length > 0) {
        const tenant2DocId = tenant2DocsResult.rows[0].id;

        // Tenant 1 user tries to access tenant 2's document
        await request(app.getHttpServer())
          .get(`/api/documents/${tenant2DocId}`)
          .set('Authorization', `Bearer ${tenant1AccessToken}`)
          .expect(404); // Returns 404 because RLS prevents seeing it
      }
    });

    it('should only show documents from own tenant in list', async () => {
      // Tenant 1 should see only their 3 documents
      const tenant1Response = await request(app.getHttpServer())
        .get('/api/documents')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(tenant1Response.body.total).toBe(3);

      // Tenant 2 should see only their 1 document
      const tenant2Response = await request(app.getHttpServer())
        .get('/api/documents')
        .set('Authorization', `Bearer ${tenant2AccessToken}`)
        .expect(200);

      expect(tenant2Response.body.total).toBe(1);
    });

    it('should enforce tenant isolation even with direct database ID', async () => {
      // Get a document ID from tenant 1
      const tenant1DocsResult = await TestDatabase.query(
        `SELECT id FROM ${tenant1Schema}.documents LIMIT 1`,
      );

      if (tenant1DocsResult.rows.length > 0) {
        const tenant1DocId = tenant1DocsResult.rows[0].id;

        // Tenant 2 user tries to access tenant 1's document with exact ID
        await request(app.getHttpServer())
          .get(`/api/documents/${tenant1DocId}`)
          .set('Authorization', `Bearer ${tenant2AccessToken}`)
          .expect(404); // RLS prevents access
      }
    });
  });

  describe('DELETE /documents/:id - Delete Document', () => {
    let systemAdminToken: string;
    let systemAdminUserId: string;

    beforeAll(async () => {
      // Create a system admin user
      const systemAdminUser = TestDataFactory.createUser();

      const signupRes = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: systemAdminUser.email,
          password: systemAdminUser.password,
          firstName: systemAdminUser.firstName,
          lastName: systemAdminUser.lastName,
          tenantName: 'System Admin Tenant',
        })
        .expect(201);

      // Get user ID from the database
      const user = await TestDatabase.getUserByEmail(systemAdminUser.email);
      systemAdminUserId = user.id;

      // Set as system admin
      await TestDatabase.setSystemAdmin(systemAdminUserId, true);

      // Verify email
      const verificationToken =
        signupRes.body.verificationToken ||
        (await TestDatabase.getVerificationToken(systemAdminUser.email));
      if (verificationToken) {
        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ token: verificationToken });
      }

      // Login to get fresh token with system admin flag
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: systemAdminUser.email,
          password: systemAdminUser.password,
        })
        .expect(200);

      systemAdminToken = loginRes.body.accessToken;
    });

    it('should reject delete request from regular user', async () => {
      await request(app.getHttpServer())
        .delete(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(403); // Forbidden - system admin only
    });

    it('should allow system admin to delete document', async () => {
      // Create a document to delete
      const docToDelete = `doc_to_delete_${Date.now()}`;
      await TestDatabase.query(
        `INSERT INTO ${tenant1Schema}.documents (id, tenant_id, title, content, metadata, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          docToDelete,
          tenant1Id,
          'Document to Delete',
          'This will be deleted',
          JSON.stringify({ templateKey: 'test' }),
          'user_test_1',
        ],
      );

      // System admin deletes it
      const response = await request(app.getHttpServer())
        .delete(`/api/documents/${docToDelete}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.message).toBe('Document deleted successfully');

      // Verify it's deleted
      await request(app.getHttpServer())
        .get(`/api/documents/${docToDelete}`)
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(404);
    });

    it('should return 404 when deleting non-existent document', async () => {
      await request(app.getHttpServer())
        .delete('/api/documents/doc_nonexistent_99999')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(404);
    });

    it('should require authentication for delete', async () => {
      await request(app.getHttpServer())
        .delete(`/api/documents/${testDocumentId}`)
        .expect(401);
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle invalid pagination parameters gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents?page=0&limit=0')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(400); // Validation should fail

      expect(response.body.message).toBeDefined();
    });

    it('should reject limit over 100', async () => {
      await request(app.getHttpServer())
        .get('/api/documents?limit=101')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(400);
    });

    it('should handle invalid date format', async () => {
      await request(app.getHttpServer())
        .get('/api/documents?startDate=invalid-date')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(400);
    });

    it('should return empty list for template key with no matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/documents?templateKey=nonexistent_template')
        .set('Authorization', `Bearer ${tenant1AccessToken}`)
        .expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.documents).toHaveLength(0);
    });
  });
});
