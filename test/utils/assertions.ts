import { getSwaggerValidator } from './swagger-validator';

/**
 * Custom assertion helpers for e2e tests
 */
export class Assertions {
  /**
   * Validate JWT token structure
   */
  static validateJWT(token: string): {
    header: any;
    payload: any;
    signature: string;
  } {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error('Invalid JWT: must have 3 parts');
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    expect(header).toHaveProperty('alg');
    expect(header).toHaveProperty('typ', 'JWT');

    expect(payload).toHaveProperty('sub'); // User ID
    expect(payload).toHaveProperty('email');
    expect(payload).toHaveProperty('tenantId');
    expect(payload).toHaveProperty('role');
    expect(payload).toHaveProperty('iat'); // Issued at
    expect(payload).toHaveProperty('exp'); // Expiration

    // Validate expiration is in the future
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now);

    return {
      header,
      payload,
      signature: parts[2],
    };
  }

  /**
   * Validate response matches Swagger schema
   */
  static validateSwaggerSchema(schemaName: string, data: any): void {
    const validator = getSwaggerValidator();
    const result = validator.validateResponse(schemaName, data);

    if (!result.valid) {
      const errors = validator.formatErrors(result.errors);
      throw new Error(
        `Response does not match Swagger schema '${schemaName}':\n${errors}`,
      );
    }
  }

  /**
   * Validate error response structure
   */
  static validateErrorResponse(
    response: any,
    expectedStatus: number,
    expectedMessage?: string,
  ): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('statusCode', expectedStatus);
    expect(response.body).toHaveProperty('message');

    if (expectedMessage) {
      if (Array.isArray(response.body.message)) {
        expect(response.body.message).toContain(expectedMessage);
      } else {
        expect(response.body.message).toContain(expectedMessage);
      }
    }
  }

  /**
   * Validate UUID format
   */
  static validateUUID(value: string): void {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(value).toMatch(uuidRegex);
  }

  /**
   * Validate timestamp format
   */
  static validateTimestamp(value: string): void {
    const date = new Date(value);
    expect(date.toString()).not.toBe('Invalid Date');
    expect(date.getTime()).toBeGreaterThan(0);
  }

  /**
   * Validate email format
   */
  static validateEmail(value: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(value).toMatch(emailRegex);
  }

  /**
   * Validate tenant ID format (starts with 'tenant_')
   */
  static validateTenantId(value: string): void {
    expect(value).toMatch(/^tenant_[a-z0-9-]+$/);
  }

  /**
   * Validate pagination response
   */
  static validatePaginationResponse(
    response: any,
    options: {
      expectedTotal?: number;
      expectedPage?: number;
      expectedLimit?: number;
    } = {},
  ): void {
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('page');
    expect(response.body).toHaveProperty('limit');
    expect(response.body.total).toBeGreaterThanOrEqual(0);

    if (options.expectedTotal !== undefined) {
      expect(response.body.total).toBe(options.expectedTotal);
    }

    if (options.expectedPage !== undefined) {
      expect(response.body.page).toBe(options.expectedPage);
    }

    if (options.expectedLimit !== undefined) {
      expect(response.body.limit).toBe(options.expectedLimit);
    }
  }

  /**
   * Validate required fields exist
   */
  static validateRequiredFields(obj: any, fields: string[]): void {
    fields.forEach((field) => {
      expect(obj).toHaveProperty(field);
      expect(obj[field]).toBeDefined();
      expect(obj[field]).not.toBeNull();
    });
  }

  /**
   * Validate plan features structure
   */
  static validatePlanFeatures(features: any): void {
    expect(features).toHaveProperty('document_limit');
    expect(features).toHaveProperty('checklist_access');
    expect(features).toHaveProperty('analyzer_enabled');
    expect(typeof features.document_limit).toBe('number');
    expect(typeof features.checklist_access).toBe('boolean');
    expect(typeof features.analyzer_enabled).toBe('boolean');
  }

  /**
   * Validate version format (semver)
   */
  static validateVersion(version: string): void {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    expect(version).toMatch(semverRegex);
  }

  /**
   * Validate template field structure
   */
  static validateTemplateField(field: any): void {
    this.validateRequiredFields(field, [
      'key',
      'label',
      'type',
      'required',
      'order',
    ]);

    expect([
      'text',
      'number',
      'date',
      'textarea',
      'select',
      'checkbox',
    ]).toContain(field.type);
    expect(typeof field.required).toBe('boolean');
    expect(typeof field.order).toBe('number');
  }

  /**
   * Validate clause structure
   */
  static validateClause(clause: any): void {
    this.validateRequiredFields(clause, [
      'id',
      'title',
      'content',
      'order',
      'is_required',
    ]);

    expect(typeof clause.is_required).toBe('boolean');
    expect(typeof clause.order).toBe('number');
  }

  /**
   * Validate RBAC role
   */
  static validateRole(role: string): void {
    expect(['admin', 'member', 'viewer']).toContain(role);
  }

  /**
   * Validate plan type
   */
  static validatePlanType(plan: string): void {
    expect(['early_access', 'basic', 'pro', 'enterprise']).toContain(plan);
  }

  /**
   * Validate status
   */
  static validateStatus(status: string): void {
    expect(['active', 'inactive', 'draft', 'archived']).toContain(status);
  }
}

/**
 * Export helper functions for easier imports
 * Bind methods to Assertions class to preserve 'this' context
 */
export const validateJWT = Assertions.validateJWT.bind(Assertions);
export const validateSwaggerSchema =
  Assertions.validateSwaggerSchema.bind(Assertions);
export const validateErrorResponse =
  Assertions.validateErrorResponse.bind(Assertions);
export const validateUUID = Assertions.validateUUID.bind(Assertions);
export const validateTimestamp = Assertions.validateTimestamp.bind(Assertions);
export const validateEmail = Assertions.validateEmail.bind(Assertions);
export const validateTenantId = Assertions.validateTenantId.bind(Assertions);
export const validatePaginationResponse =
  Assertions.validatePaginationResponse.bind(Assertions);
export const validateRequiredFields =
  Assertions.validateRequiredFields.bind(Assertions);
export const validatePlanFeatures =
  Assertions.validatePlanFeatures.bind(Assertions);
export const validateVersion = Assertions.validateVersion.bind(Assertions);
export const validateTemplateField =
  Assertions.validateTemplateField.bind(Assertions);
export const validateClause = Assertions.validateClause.bind(Assertions);
export const validateRole = Assertions.validateRole.bind(Assertions);
export const validatePlanType = Assertions.validatePlanType.bind(Assertions);
export const validateStatus = Assertions.validateStatus.bind(Assertions);
