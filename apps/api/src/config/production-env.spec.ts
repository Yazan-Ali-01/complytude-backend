import type { ObjectSchema } from 'joi';
import { validationSchema as workerAi } from '../../../worker-ai/src/config/env.schema';
import { validationSchema as workerGeneration } from '../../../worker-generation/src/config/env.schema';
import { validationSchema as workerIngestion } from '../../../worker-ingestion/src/config/env.schema';
import { validationSchema as api } from './env.schema';

/** A complete, valid production environment for every app (each ignores the keys it lacks). */
const PRODUCTION: Record<string, string> = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal',
  DB_PORT: '5432',
  DB_NAME: 'complytude',
  DB_APP_USER: 'app_login',
  DB_APP_PASSWORD: 'Vq3r8KxZp2Lm9Wt4Ys6N',
  DB_SSL_ENABLED: 'true',
  REDIS_HOST: 'redis.internal',
  REDIS_PORT: '6379',
  CORS_ORIGINS: 'https://app.example.com',
  FRONTEND_URL: 'https://app.example.com',
  TRUST_PROXY_HOPS: '1',
  JWT_ACCESS_SECRET: 'a'.repeat(16) + '0123456789abcdef',
  JWT_REFRESH_SECRET: 'b'.repeat(16) + '0123456789abcdef',
  JWT_IDENTITY_SECRET: 'c'.repeat(16) + '0123456789abcdef',
  JWT_IDENTITY_REFRESH_SECRET: 'd'.repeat(16) + '0123456789abcdef',
  STRIPE_MODE: 'live',
  STRIPE_SECRET_KEY: 'sk_live_51H8xYz0123456789abcdef',
  STRIPE_WEBHOOK_SECRET: 'whsec_0123456789abcdefghij',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_51H8xYz0123456789',
  BULL_BOARD_ADMIN_SECRET: 'e'.repeat(40),
  FROM_EMAIL: 'noreply@example.com',
  SUPPORT_EMAIL: 'support@example.com',
  OPENAI_API_KEY: 'sk-proj-0123456789abcdefghijklmn',
  COHERE_API_KEY: 'co-0123456789abcdefghijklmnop',
  GOTENBERG_URL: 'http://gotenberg.internal:3000',
};

const APPS: Array<[string, ObjectSchema, string[]]> = [
  [
    'api',
    api,
    [
      'DB_APP_PASSWORD',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_IDENTITY_SECRET',
      'JWT_IDENTITY_REFRESH_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ],
  ],
  [
    'worker-ai',
    workerAi,
    ['DB_APP_PASSWORD', 'OPENAI_API_KEY', 'COHERE_API_KEY'],
  ],
  ['worker-ingestion', workerIngestion, ['DB_APP_PASSWORD', 'OPENAI_API_KEY']],
  ['worker-generation', workerGeneration, ['DB_APP_PASSWORD']],
];

function errors(schema: ObjectSchema, env: Record<string, string>): string[] {
  const { error } = schema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  });
  return error?.details.map((detail) => detail.message) ?? [];
}

function without(key: string): Record<string, string> {
  const env = { ...PRODUCTION };
  delete env[key];
  return env;
}

describe('production environment validation', () => {
  describe.each(APPS)('%s', (_app, schema, secrets) => {
    it('accepts a complete production environment', () => {
      expect(errors(schema, PRODUCTION)).toEqual([]);
    });

    it.each(secrets)('refuses to boot without %s', (key) => {
      expect(errors(schema, without(key))).toEqual([
        `${key} is required when NODE_ENV=production`,
      ]);
    });

    it.each(secrets)('refuses a short or placeholder %s', (key) => {
      expect(errors(schema, { ...PRODUCTION, [key]: 'short' })).toEqual([
        expect.stringContaining(`${key} must be at least`),
      ]);
      expect(
        errors(schema, {
          ...PRODUCTION,
          [key]: 'your-super-secret-key-change-this-in-production',
        }),
      ).toEqual([
        `${key} is a placeholder value; set a real secret when NODE_ENV=production`,
      ]);
    });
  });

  describe('api', () => {
    it('accepts a list of https origins, spaces and trailing slashes included', () => {
      expect(
        errors(api, {
          ...PRODUCTION,
          CORS_ORIGINS: 'https://app.example.com, https://admin.example.com/',
        }),
      ).toEqual([]);
    });

    it.each([
      ['http://app.example.com', 'must be https when NODE_ENV=production'],
      ['*', 'is not an origin'],
      ['app.example.com', 'is not an origin'],
      ['https://app.example.com, ftp://files.example.com', 'must be https'],
    ])('refuses CORS_ORIGINS=%s', (value, message) => {
      expect(errors(api, { ...PRODUCTION, CORS_ORIGINS: value })).toEqual([
        expect.stringContaining(message),
      ]);
    });

    it('accepts http origins outside production', () => {
      expect(
        errors(api, {
          ...PRODUCTION,
          NODE_ENV: 'development',
          CORS_ORIGINS: 'http://localhost:3001',
        }).filter((message) => message.includes('CORS_ORIGINS')),
      ).toEqual([]);
    });

    it('needs the four JWT secrets to be different', () => {
      expect(
        errors(api, {
          ...PRODUCTION,
          JWT_REFRESH_SECRET: PRODUCTION.JWT_ACCESS_SECRET,
        }),
      ).toEqual([expect.stringContaining('must all be different')]);
    });

    it('needs STRIPE_MODE, and keys of that mode', () => {
      expect(errors(api, without('STRIPE_MODE'))).toEqual([
        'STRIPE_MODE (test or live) is required when NODE_ENV=production',
      ]);
      expect(errors(api, { ...PRODUCTION, STRIPE_MODE: 'test' })).toEqual([
        'STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY must be test-mode keys (STRIPE_MODE=test)',
      ]);
      expect(
        errors(api, {
          ...PRODUCTION,
          STRIPE_MODE: 'test',
          STRIPE_SECRET_KEY: 'rk_test_51H8xYz0123456789abcdef',
          STRIPE_PUBLISHABLE_KEY: 'pk_test_51H8xYz0123456789',
        }),
      ).toEqual([]);
    });

    it('needs an https FRONTEND_URL', () => {
      expect(errors(api, without('FRONTEND_URL'))).toEqual([
        'FRONTEND_URL is required when NODE_ENV=production',
      ]);
      expect(
        errors(api, { ...PRODUCTION, FRONTEND_URL: 'http://localhost:3000' }),
      ).toEqual(['FRONTEND_URL must be an https URL when NODE_ENV=production']);
    });

    it('needs the proxy hop count, so client IPs come from the ALB', () => {
      expect(errors(api, without('TRUST_PROXY_HOPS'))).toEqual([
        'TRUST_PROXY_HOPS is required when NODE_ENV=production',
      ]);
      expect(errors(api, { ...PRODUCTION, TRUST_PROXY_HOPS: '0' })).toEqual([
        'TRUST_PROXY_HOPS must be at least 1 when NODE_ENV=production',
      ]);
    });

    it('connects to the database over verified TLS only', () => {
      expect(errors(api, without('DB_SSL_ENABLED'))).toEqual([
        'DB_SSL_ENABLED must be true when NODE_ENV=production',
      ]);
      expect(errors(api, { ...PRODUCTION, DB_SSL_ENABLED: 'false' })).toEqual([
        'DB_SSL_ENABLED must be true when NODE_ENV=production',
      ]);
      expect(
        errors(api, { ...PRODUCTION, DB_SSL_REJECT_UNAUTHORIZED: 'false' }),
      ).toEqual([
        'DB_SSL_REJECT_UNAUTHORIZED must not be false when NODE_ENV=production',
      ]);
    });

    it('never echoes tokens in production', () => {
      expect(errors(api, { ...PRODUCTION, AUTH_ECHO_TOKENS: 'true' })).toEqual([
        'AUTH_ECHO_TOKENS must not be true when NODE_ENV=production',
      ]);
    });

    it('accepts SSO left off, but not a placeholder SSO secret', () => {
      expect(errors(api, { ...PRODUCTION, GOOGLE_CLIENT_SECRET: '' })).toEqual(
        [],
      );
      expect(
        errors(api, {
          ...PRODUCTION,
          GOOGLE_CLIENT_SECRET: 'your-google-client-secret-here',
        }),
      ).toEqual([expect.stringContaining('placeholder')]);
    });

    it('keeps local defaults outside production', () => {
      const { error, value } = api.validate(
        {
          ...without('FRONTEND_URL'),
          NODE_ENV: 'development',
          DB_APP_PASSWORD: 'postgres',
          JWT_ACCESS_SECRET: 'dev-a',
          JWT_REFRESH_SECRET: 'dev-b',
          JWT_IDENTITY_SECRET: 'dev-c',
          JWT_IDENTITY_REFRESH_SECRET: 'dev-d',
          AUTH_ECHO_TOKENS: 'true',
        },
        { allowUnknown: true, abortEarly: false },
      );
      expect(error).toBeUndefined();
      expect(value).toMatchObject({
        FRONTEND_URL: 'http://localhost:3000',
        AUTH_ECHO_TOKENS: true,
      });
    });
  });
});
