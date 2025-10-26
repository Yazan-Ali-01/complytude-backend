/**
 * Custom Jest matchers for e2e tests
 * This file is automatically loaded by Jest via setupFilesAfterEnv
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidJWT(): R;
      toBeValidEmail(): R;
      toBeValidTenantId(): R;
      toBeValidTimestamp(): R;
      toBeValidVersion(): R;
    }
  }
}

expect.extend({
  /**
   * Check if value is a valid UUID
   */
  toBeValidUUID(received: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },

  /**
   * Check if value is a valid JWT token
   */
  toBeValidJWT(received: string) {
    const parts = received.split('.');
    const pass = parts.length === 3;

    if (!pass) {
      return {
        pass,
        message: () =>
          `expected ${received} to be a valid JWT token (must have 3 parts)`,
      };
    }

    try {
      // Try to decode header and payload
      JSON.parse(Buffer.from(parts[0], 'base64').toString());
      JSON.parse(Buffer.from(parts[1], 'base64').toString());

      return {
        pass: true,
        message: () => `expected ${received} not to be a valid JWT token`,
      };
    } catch {
      return {
        pass: false,
        message: () =>
          `expected ${received} to be a valid JWT token (failed to decode)`,
      };
    }
  },

  /**
   * Check if value is a valid email
   */
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid email`
          : `expected ${received} to be a valid email`,
    };
  },

  /**
   * Check if value is a valid tenant ID
   */
  toBeValidTenantId(received: string) {
    const tenantIdRegex = /^tenant_[a-z0-9-]+$/;
    const pass = tenantIdRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid tenant ID`
          : `expected ${received} to be a valid tenant ID (format: tenant_xxx)`,
    };
  },

  /**
   * Check if value is a valid ISO timestamp
   */
  toBeValidTimestamp(received: string) {
    const date = new Date(received);
    const pass = date.toString() !== 'Invalid Date' && date.getTime() > 0;

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid timestamp`
          : `expected ${received} to be a valid timestamp`,
    };
  },

  /**
   * Check if value is a valid semantic version
   */
  toBeValidVersion(received: string) {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    const pass = semverRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid semantic version`
          : `expected ${received} to be a valid semantic version (format: x.y.z)`,
    };
  },
});

export {};
