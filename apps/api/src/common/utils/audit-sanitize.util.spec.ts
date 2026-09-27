import { sanitizeBody } from './audit-sanitize.util';

describe('sanitizeBody', () => {
  it('returns null as-is', () => {
    expect(sanitizeBody(null)).toBeNull();
  });

  it('returns undefined as-is', () => {
    expect(sanitizeBody(undefined)).toBeUndefined();
  });

  it('preserves primitive values', () => {
    expect(sanitizeBody(42)).toBe(42);
    expect(sanitizeBody(true)).toBe(true);
    expect(sanitizeBody('hello')).toBe('hello');
  });

  it('preserves non-sensitive object properties', () => {
    const body = { name: 'John', email: 'john@example.com', age: 30 };
    expect(sanitizeBody(body)).toEqual(body);
  });

  it('redacts sensitive keys (case-insensitive)', () => {
    const body = {
      name: 'John',
      password: 'secret123',
      Token: 'abc-token',
      API_KEY: 'key-value',
    };
    expect(sanitizeBody(body)).toEqual({
      name: 'John',
      password: '[REDACTED]',
      Token: '[REDACTED]',
      API_KEY: '[REDACTED]',
    });
  });

  it('redacts all known sensitive keys', () => {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'authorization',
      'creditCard',
      'credit_card',
      'ssn',
      'social_security',
      'api_key',
      'apiKey',
      'private_key',
      'privateKey',
      'access_token',
      'accessToken',
      'refresh_token',
      'refreshToken',
      'session',
      'cookie',
    ];

    const body: Record<string, string> = {};
    for (const key of sensitiveKeys) {
      body[key] = 'sensitive-value';
    }

    const result = sanitizeBody(body) as Record<string, string>;

    for (const key of sensitiveKeys) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('truncates strings exceeding max length', () => {
    const longString = 'a'.repeat(600);
    const result = sanitizeBody(longString) as string;
    expect(result).toHaveLength(500 + '...[TRUNCATED]'.length);
    expect(result.endsWith('...[TRUNCATED]')).toBe(true);
  });

  it('truncates string values in objects', () => {
    const body = { description: 'x'.repeat(600) };
    const result = sanitizeBody(body) as Record<string, string>;
    expect(result.description.endsWith('...[TRUNCATED]')).toBe(true);
    expect(result.description.length).toBeLessThan(600);
  });

  it('handles nested objects up to depth limit', () => {
    const body = {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: {
                shouldExceed: 'value',
              },
            },
          },
        },
      },
    };
    const result = sanitizeBody(body) as Record<string, unknown>;
    const l1 = result.l1 as Record<string, unknown>;
    const l2 = l1.l2 as Record<string, unknown>;
    const l3 = l2.l3 as Record<string, unknown>;
    const l4 = l3.l4 as Record<string, unknown>;
    expect(l4.l5).toBe('[MAX_DEPTH_EXCEEDED]');
  });

  it('handles arrays', () => {
    const body = [{ name: 'a' }, { name: 'b', password: 'secret' }];
    expect(sanitizeBody(body)).toEqual([
      { name: 'a' },
      { name: 'b', password: '[REDACTED]' },
    ]);
  });

  it('handles mixed nested structures', () => {
    const body = {
      users: [
        { name: 'Alice', token: 'abc' },
        { name: 'Bob', secret: 'xyz' },
      ],
      meta: { count: 2 },
    };
    expect(sanitizeBody(body)).toEqual({
      users: [
        { name: 'Alice', token: '[REDACTED]' },
        { name: 'Bob', secret: '[REDACTED]' },
      ],
      meta: { count: 2 },
    });
  });

  it('handles empty objects and arrays', () => {
    expect(sanitizeBody({})).toEqual({});
    expect(sanitizeBody([])).toEqual([]);
  });
});
