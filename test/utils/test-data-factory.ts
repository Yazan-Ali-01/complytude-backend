import { randomUUID } from 'crypto';

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  role?: 'admin' | 'member' | 'viewer';
}

export interface TestTenant {
  tenantName: string;
  email: string;
  plan?: 'early_access' | 'basic' | 'pro' | 'enterprise';
}

export interface TestAuthority {
  code: string;
  name: string;
  description: string;
  country: string;
}

export interface TestCategory {
  code: string;
  name: string;
  description: string;
}

export interface TestRuleset {
  key: string;
  name: string;
  description: string;
  authority_id: string;
  version: string;
  clauses: Array<{
    id: string;
    title: string;
    content: string;
    order: number;
    is_required: boolean;
  }>;
}

export interface TestTemplate {
  key: string;
  name: string;
  description: string;
  category_id: string;
  authority_id: string;
  languages: string[];
  fields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    order: number;
  }>;
  ruleset_keys?: string[];
  version: string;
}

/**
 * Test Data Factory
 * Generates unique test data for e2e tests
 */
export class TestDataFactory {
  private static counter = 0;

  /**
   * Generate unique email
   */
  static generateEmail(prefix = 'test'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}.${timestamp}.${random}@test.complytude.com`;
  }

  /**
   * Generate unique tenant name
   */
  static generateTenantName(prefix = 'test'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}_tenant_${timestamp}_${random}`;
  }

  /**
   * Generate unique code
   */
  static generateCode(prefix = 'TEST'): string {
    this.counter++;
    const timestamp = Date.now();
    return `${prefix}_${timestamp}_${this.counter}`;
  }

  /**
   * Generate unique key
   */
  static generateKey(prefix = 'test'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Create test user data
   */
  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      email: this.generateEmail('user'),
      password: 'Test@Pass123!',
      firstName: 'Test',
      lastName: 'User',
      tenantName: this.generateTenantName('user'),
      ...overrides,
    };
  }

  /**
   * Create admin user data
   */
  static createAdminUser(overrides: Partial<TestUser> = {}): TestUser {
    return this.createUser({
      email: this.generateEmail('admin'),
      firstName: 'Admin',
      lastName: 'User',
      tenantName: this.generateTenantName('admin'),
      role: 'admin',
      ...overrides,
    });
  }

  /**
   * Create system admin user data
   */
  static createSystemAdmin(overrides: Partial<TestUser> = {}): TestUser {
    return this.createUser({
      email: this.generateEmail('sysadmin'),
      firstName: 'System',
      lastName: 'Admin',
      tenantName: this.generateTenantName('sysadmin'),
      role: 'admin',
      ...overrides,
    });
  }

  /**
   * Create test tenant data
   */
  static createTenant(overrides: Partial<TestTenant> = {}): TestTenant {
    return {
      tenantName: this.generateTenantName(),
      email: this.generateEmail('tenant'),
      plan: 'basic',
      ...overrides,
    };
  }

  /**
   * Create test authority data
   */
  static createAuthority(
    overrides: Partial<TestAuthority> = {},
  ): TestAuthority {
    const code = this.generateCode('AUTH');
    return {
      code,
      name: `Test Authority ${code}`,
      description: 'Test authority for e2e testing',
      country: 'UAE',
      ...overrides,
    };
  }

  /**
   * Create test category data
   */
  static createCategory(overrides: Partial<TestCategory> = {}): TestCategory {
    const code = this.generateCode('CAT').toLowerCase();
    return {
      code,
      name: `Test Category ${code}`,
      description: 'Test category for e2e testing',
      ...overrides,
    };
  }

  /**
   * Create test ruleset data
   */
  static createRuleset(
    authorityId: string,
    overrides: Partial<TestRuleset> = {},
  ): TestRuleset {
    const key = this.generateKey('ruleset');
    return {
      key,
      name: `Test Ruleset ${key}`,
      description: 'Test ruleset for e2e testing',
      authority_id: authorityId,
      version: '1.0.0',
      clauses: [
        {
          id: 'clause_1',
          title: 'Test Clause 1',
          content: 'This is a test clause content.',
          order: 1,
          is_required: true,
        },
        {
          id: 'clause_2',
          title: 'Test Clause 2',
          content: 'This is another test clause content.',
          order: 2,
          is_required: false,
        },
      ],
      ...overrides,
    };
  }

  /**
   * Create test template data
   */
  static createTemplate(
    categoryId: string,
    authorityId: string,
    overrides: Partial<TestTemplate> = {},
  ): TestTemplate {
    const key = this.generateKey('template');
    return {
      key,
      name: `Test Template ${key}`,
      description: 'Test template for e2e testing',
      category_id: categoryId,
      authority_id: authorityId,
      languages: ['en'],
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
      ],
      version: '1.0.0',
      ...overrides,
    };
  }

  /**
   * Create test file buffer
   */
  static createTestFile(
    content = 'Test file content',
    filename = 'test.txt',
  ): { buffer: Buffer; filename: string; mimetype: string } {
    return {
      buffer: Buffer.from(content),
      filename,
      mimetype: 'text/plain',
    };
  }

  /**
   * Create test PDF buffer
   */
  static createTestPDF(filename = 'test.pdf'): {
    buffer: Buffer;
    filename: string;
    mimetype: string;
  } {
    // Minimal PDF structure
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;

    return {
      buffer: Buffer.from(pdfContent),
      filename,
      mimetype: 'application/pdf',
    };
  }

  /**
   * Generate random string
   */
  static randomString(length = 10): string {
    return randomUUID().replace(/-/g, '').substring(0, length);
  }

  /**
   * Generate random number
   */
  static randomNumber(min = 0, max = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Wait for a specified time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
