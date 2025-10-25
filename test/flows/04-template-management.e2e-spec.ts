import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, closeTestApp } from '../utils/test-context';
import { TestDataFactory } from '../utils/test-data-factory';
import { TestDatabase } from '../utils/test-database';
import {
  validateRequiredFields,
  validateVersion,
  validateTemplateField,
  validateClause,
} from '../utils/assertions';

describe('Template Management Flow (e2e)', () => {
  let app: INestApplication;
  let systemAdminToken: string;
  let systemAdminId: string;
  let tenantId: string;

  let authorityId: string;
  let categoryId: string;
  let rulesetKey: string;
  let templateKey: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create system admin user
    const adminUser = TestDataFactory.createSystemAdmin();

    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: adminUser.email,
        password: adminUser.password,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        tenantName: adminUser.tenantName,
      })
      .expect(201);

    systemAdminId = signupRes.body.userId;
    tenantId = signupRes.body.tenantId;

    // Verify email first
    const verificationToken =
      signupRes.body.verificationToken ||
      (await TestDatabase.getVerificationToken(adminUser.email));
    if (verificationToken) {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: verificationToken });
    }

    // Set as system admin in database (uses shared DatabaseService)
    await TestDatabase.setSystemAdmin(systemAdminId, true);

    // Login AFTER setting system admin to get JWT with isSystemAdmin flag
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: adminUser.email,
        password: adminUser.password,
      })
      .expect(200);

    systemAdminToken = loginRes.body.accessToken;
    expect(systemAdminToken).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup in reverse order
    if (templateKey) {
      await TestDatabase.cleanupTemplate(templateKey);
    }
    if (rulesetKey) {
      await TestDatabase.cleanupRuleset(rulesetKey);
    }
    if (categoryId) {
      await TestDatabase.cleanupCategory(categoryId);
    }
    if (authorityId) {
      await TestDatabase.cleanupAuthority(authorityId);
    }
    if (tenantId) {
      await TestDatabase.cleanupTenant(tenantId);
    }

    // Don't close the app - it's shared across test files
    // await closeTestApp();
  });

  describe('1. Create Authority', () => {
    it('should create a legal authority (system admin only)', async () => {
      const authority = TestDataFactory.createAuthority();

      const response = await request(app.getHttpServer())
        .post('/api/authorities')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          code: authority.code,
          name: authority.name,
          description: authority.description,
          country: authority.country,
          is_active: true,
        })
        .expect(201);

      validateRequiredFields(response.body, [
        'id',
        'code',
        'name',
        'country',
        'is_active',
      ]);

      authorityId = response.body.id;
      expect(authorityId).toBeValidUUID();
      expect(response.body.code).toBe(authority.code);
    });

    it('should list authorities', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/authorities')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const createdAuthority = response.body.find(
        (a: any) => a.id === authorityId,
      );
      expect(createdAuthority).toBeDefined();
    });

    it('should get authority by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/authorities/${authorityId}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(authorityId);
    });
  });

  describe('2. Create Category', () => {
    it('should create a template category (system admin only)', async () => {
      const category = TestDataFactory.createCategory();

      const response = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          code: category.code,
          name: category.name,
          description: category.description,
          is_active: true,
        })
        .expect(201);

      validateRequiredFields(response.body, [
        'id',
        'code',
        'name',
        'is_active',
      ]);

      categoryId = response.body.id;
      expect(categoryId).toBeValidUUID();
    });

    it('should list categories', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const createdCategory = response.body.find(
        (c: any) => c.id === categoryId,
      );
      expect(createdCategory).toBeDefined();
    });
  });

  describe('3. Create Ruleset', () => {
    it('should create a legal ruleset with clauses', async () => {
      const ruleset = TestDataFactory.createRuleset(authorityId);

      const response = await request(app.getHttpServer())
        .post('/api/rulesets')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          key: ruleset.key,
          name: ruleset.name,
          description: ruleset.description,
          authority_id: ruleset.authority_id,
          clauses: ruleset.clauses,
          version: ruleset.version,
          status: 'active',
        })
        .expect(201);

      validateRequiredFields(response.body, [
        'key',
        'name',
        'authority_id',
        'version',
        'status',
      ]);

      rulesetKey = response.body.key;
      expect(response.body.key).toBe(ruleset.key);
      validateVersion(response.body.version);

      // Validate clauses
      if (response.body.clauses) {
        expect(Array.isArray(response.body.clauses)).toBe(true);
        response.body.clauses.forEach((clause: any) => {
          validateClause(clause);
        });
      }
    });

    it('should get ruleset by key', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/rulesets/${rulesetKey}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.key).toBe(rulesetKey);
      expect(response.body.clauses).toBeDefined();
      expect(response.body.clauses.length).toBeGreaterThan(0);
    });

    it('should list rulesets', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/rulesets')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const createdRuleset = response.body.find(
        (r: any) => r.key === rulesetKey,
      );
      expect(createdRuleset).toBeDefined();
    });
  });

  describe('4. Create Template', () => {
    it('should create a document template', async () => {
      const template = TestDataFactory.createTemplate(categoryId, authorityId);

      const response = await request(app.getHttpServer())
        .post('/api/templates')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          key: template.key,
          name: template.name,
          description: template.description,
          category_id: template.category_id,
          authority_id: template.authority_id,
          languages: template.languages,
          fields: template.fields,
          ruleset_keys: [rulesetKey],
          version: template.version,
          status: 'active',
        })
        .expect(201);

      validateRequiredFields(response.body, [
        'key',
        'name',
        'current_version',
        'status',
      ]);

      templateKey = response.body.key;
      expect(response.body.key).toBe(template.key);
      validateVersion(response.body.current_version);
    });

    it('should get template details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/templates/${templateKey}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.key).toBe(templateKey);
      validateRequiredFields(response.body, [
        'key',
        'name',
        'current_version',
        'category',
        'authority',
      ]);

      // Validate fields
      if (response.body.current_version_details) {
        const fields = response.body.current_version_details.fields;
        expect(Array.isArray(fields)).toBe(true);
        fields.forEach((field: any) => {
          validateTemplateField(field);
        });
      }
    });

    it('should list templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/templates')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      validateRequiredFields(response.body, ['templates', 'total', 'page']);
      expect(Array.isArray(response.body.templates)).toBe(true);

      const createdTemplate = response.body.templates.find(
        (t: any) => t.key === templateKey,
      );
      expect(createdTemplate).toBeDefined();
    });
  });

  describe('5. Update Template Version', () => {
    it('should create new version of template', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/templates/${templateKey}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .send({
          name: `Updated Template ${templateKey}`,
          version: '1.1.0',
          changelog: 'Added new field',
          fields: [
            {
              key: 'field_1',
              label: 'Test Field 1',
              type: 'text',
              required: true,
              order: 1,
            },
            {
              key: 'field_2',
              label: 'Test Field 2',
              type: 'number',
              required: false,
              order: 2,
            },
            {
              key: 'field_3',
              label: 'New Field 3',
              type: 'date',
              required: false,
              order: 3,
            },
          ],
        })
        .expect(200);

      expect(response.body.current_version).toBe('1.1.0');
    });

    it('should get version history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/templates/${templateKey}/versions`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Should have both 1.0.0 and 1.1.0
      const versions = response.body.map((v: any) => v.version);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.1.0');
    });

    it('should get specific version', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/templates/${templateKey}/versions/1.0.0`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.version).toBe('1.0.0');
    });
  });

  describe('6. Rollback Template', () => {
    it('should rollback to previous version', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/templates/${templateKey}/versions/1.0.0/rollback`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.is_active).toBe(true);

      // Verify current version is now 1.0.0
      const templateRes = await request(app.getHttpServer())
        .get(`/api/templates/${templateKey}`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(templateRes.body.current_version).toBe('1.0.0');
    });
  });

  describe('7. Deactivate Template', () => {
    it('should deactivate template', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/templates/${templateKey}/deactivate`)
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      expect(response.body.status).toBe('inactive');
    });

    it('should not appear in active templates list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/templates/active')
        .set('Authorization', `Bearer ${systemAdminToken}`)
        .expect(200);

      const activeTemplate = response.body.find(
        (t: any) => t.key === templateKey,
      );
      expect(activeTemplate).toBeUndefined();
    });
  });
});
