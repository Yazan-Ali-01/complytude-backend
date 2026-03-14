import {
  PINO_REDACT_PATHS,
  REDACTED,
  SENSITIVE_KEYS,
  sanitizeObject,
} from './logger.redaction';

describe('logger.redaction', () => {
  describe('SENSITIVE_KEYS', () => {
    it('includes all required PII keys (lowercase)', () => {
      const required = [
        'password',
        'token',
        'authorization',
        'cookie',
        'secret',
        'api_key',
        'apikey',
        'access_token',
        'accesstoken',
        'refresh_token',
        'refreshtoken',
      ];
      for (const key of required) {
        expect(SENSITIVE_KEYS.has(key)).toBe(true);
      }
    });
  });

  describe('PINO_REDACT_PATHS', () => {
    it('covers req.headers.authorization and req.headers.cookie', () => {
      expect(PINO_REDACT_PATHS).toContain('req.headers.authorization');
      expect(PINO_REDACT_PATHS).toContain('req.headers.cookie');
    });

    it('covers top-level body fields for all sensitive keys', () => {
      const topLevel = [
        'req.body.password',
        'req.body.token',
        'req.body.secret',
        'req.body.api_key',
        'req.body.apiKey',
        'req.body.access_token',
        'req.body.accessToken',
        'req.body.refresh_token',
        'req.body.refreshToken',
      ];
      for (const path of topLevel) {
        expect(PINO_REDACT_PATHS).toContain(path);
      }
    });

    it('covers one-level wildcard body paths for all sensitive keys', () => {
      const wildcard = [
        'req.body.*.password',
        'req.body.*.token',
        'req.body.*.secret',
        'req.body.*.api_key',
        'req.body.*.apiKey',
        'req.body.*.access_token',
        'req.body.*.accessToken',
        'req.body.*.refresh_token',
        'req.body.*.refreshToken',
      ];
      for (const path of wildcard) {
        expect(PINO_REDACT_PATHS).toContain(path);
      }
    });
  });

  describe('sanitizeObject', () => {
    describe('pass-through for non-objects', () => {
      it.each([
        ['string', 'hello'],
        ['number', 42],
        ['boolean', true],
        ['null', null],
        ['undefined', undefined],
      ])('%s passes through unchanged', (_, value) => {
        expect(sanitizeObject(value)).toBe(value);
      });

      it('passes Date objects through unchanged', () => {
        const date = new Date('2026-01-01');
        expect(sanitizeObject(date)).toBe(date);
      });

      it('passes RegExp objects through unchanged', () => {
        const regex = /test/gi;
        expect(sanitizeObject(regex)).toBe(regex);
      });

      it('preserves Date inside a nested object', () => {
        const date = new Date('2026-06-15');
        const input = { createdAt: date, password: 'secret' };
        expect(sanitizeObject(input)).toEqual({
          createdAt: date,
          password: REDACTED,
        });
      });
    });

    describe('top-level key redaction', () => {
      it('redacts password', () => {
        expect(sanitizeObject({ password: 'secret123' })).toEqual({
          password: REDACTED,
        });
      });

      it('redacts token', () => {
        expect(sanitizeObject({ token: 'abc.def.ghi' })).toEqual({
          token: REDACTED,
        });
      });

      it('redacts authorization', () => {
        expect(sanitizeObject({ authorization: 'Bearer xyz' })).toEqual({
          authorization: REDACTED,
        });
      });

      it('redacts cookie', () => {
        expect(sanitizeObject({ cookie: 'session=abc' })).toEqual({
          cookie: REDACTED,
        });
      });

      it('redacts secret', () => {
        expect(sanitizeObject({ secret: 'my-secret' })).toEqual({
          secret: REDACTED,
        });
      });

      it('redacts api_key', () => {
        expect(sanitizeObject({ api_key: 'key123' })).toEqual({
          api_key: REDACTED,
        });
      });

      it('redacts apiKey', () => {
        expect(sanitizeObject({ apiKey: 'key123' })).toEqual({
          apiKey: REDACTED,
        });
      });

      it('redacts access_token', () => {
        expect(sanitizeObject({ access_token: 'tok' })).toEqual({
          access_token: REDACTED,
        });
      });

      it('redacts accessToken', () => {
        expect(sanitizeObject({ accessToken: 'tok' })).toEqual({
          accessToken: REDACTED,
        });
      });

      it('redacts refresh_token', () => {
        expect(sanitizeObject({ refresh_token: 'ref' })).toEqual({
          refresh_token: REDACTED,
        });
      });

      it('redacts refreshToken', () => {
        expect(sanitizeObject({ refreshToken: 'ref' })).toEqual({
          refreshToken: REDACTED,
        });
      });
    });

    describe('case-insensitive key matching', () => {
      it('redacts PASSWORD (uppercase)', () => {
        expect(sanitizeObject({ PASSWORD: 'secret' })).toEqual({
          PASSWORD: REDACTED,
        });
      });

      it('redacts ApiKey (mixed case)', () => {
        expect(sanitizeObject({ ApiKey: 'k' })).toEqual({ ApiKey: REDACTED });
      });
    });

    describe('preserves non-sensitive keys', () => {
      it('passes through email', () => {
        expect(sanitizeObject({ email: 'test@example.com' })).toEqual({
          email: 'test@example.com',
        });
      });

      it('passes through name and keeps structure', () => {
        expect(sanitizeObject({ name: 'John', age: 30, active: true })).toEqual(
          { name: 'John', age: 30, active: true },
        );
      });
    });

    describe('mixed objects (redacts sensitive, preserves safe)', () => {
      it('matches the ticket example exactly', () => {
        const input = {
          user: { email: 'test@example.com', password: 'secret123' },
        };
        expect(sanitizeObject(input)).toEqual({
          user: { email: 'test@example.com', password: REDACTED },
        });
      });

      it('handles multiple sensitive keys in one object', () => {
        expect(
          sanitizeObject({ username: 'alice', password: 'pw', token: 't' }),
        ).toEqual({ username: 'alice', password: REDACTED, token: REDACTED });
      });
    });

    describe('nested object redaction', () => {
      it('redacts two levels deep', () => {
        const input = { a: { b: { password: 'deep' } } };
        expect(sanitizeObject(input)).toEqual({
          a: { b: { password: REDACTED } },
        });
      });

      it('redacts three levels deep', () => {
        const input = { x: { y: { z: { secret: 'val' } } } };
        expect(sanitizeObject(input)).toEqual({
          x: { y: { z: { secret: REDACTED } } },
        });
      });

      it('preserves safe sibling keys at every nesting level', () => {
        const input = {
          level1: 'safe',
          nested: { level2: 'also safe', token: 'redact-me' },
        };
        expect(sanitizeObject(input)).toEqual({
          level1: 'safe',
          nested: { level2: 'also safe', token: REDACTED },
        });
      });
    });

    describe('array redaction', () => {
      it('redacts sensitive keys in array elements', () => {
        const input = [
          { name: 'Alice', password: 'pw1' },
          { name: 'Bob', password: 'pw2' },
        ];
        expect(sanitizeObject(input)).toEqual([
          { name: 'Alice', password: REDACTED },
          { name: 'Bob', password: REDACTED },
        ]);
      });

      it('handles arrays of primitives without modification', () => {
        expect(sanitizeObject([1, 'hello', true])).toEqual([1, 'hello', true]);
      });

      it('handles nested arrays', () => {
        const input = [[{ token: 'abc' }], [{ name: 'safe' }]];
        expect(sanitizeObject(input)).toEqual([
          [{ token: REDACTED }],
          [{ name: 'safe' }],
        ]);
      });

      it('handles mixed array of objects and primitives', () => {
        const input = [{ secret: 'x' }, 42, null, 'string'];
        expect(sanitizeObject(input)).toEqual([
          { secret: REDACTED },
          42,
          null,
          'string',
        ]);
      });
    });

    describe('edge cases', () => {
      it('returns an empty object unchanged', () => {
        expect(sanitizeObject({})).toEqual({});
      });

      it('returns an empty array unchanged', () => {
        expect(sanitizeObject([])).toEqual([]);
      });

      it('does not mutate the original object', () => {
        const input = { password: 'secret', name: 'Alice' };
        sanitizeObject(input);
        expect(input.password).toBe('secret');
      });

      it('handles a sensitive key with a null value', () => {
        expect(sanitizeObject({ password: null })).toEqual({
          password: REDACTED,
        });
      });

      it('handles a sensitive key whose value is already REDACTED', () => {
        expect(sanitizeObject({ token: REDACTED })).toEqual({
          token: REDACTED,
        });
      });
    });
  });
});
