import { validationSchema } from './env.schema';

/** Validates `env` and returns only the errors and value for one key. */
function validateKey(
  key: string,
  env: Record<string, string>,
): { errors: string[]; value: unknown } {
  const { error, value } = validationSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  }) as {
    error?: { details: { path: (string | number)[]; message: string }[] };
    value: Record<string, unknown>;
  };
  return {
    errors: (error?.details ?? [])
      .filter((d) => d.path[0] === key)
      .map((d) => d.message),
    value: value[key],
  };
}

const validateMockRoutes = (
  env: Record<string, string>,
): { errors: string[]; value: unknown } =>
  validateKey('ENABLE_MOCK_ROUTES', env);

describe('env schema: ENABLE_MOCK_ROUTES', () => {
  it('defaults to false', () => {
    expect(validateMockRoutes({})).toEqual({ errors: [], value: false });
    expect(validateMockRoutes({ NODE_ENV: 'production' })).toEqual({
      errors: [],
      value: false,
    });
  });

  it.each(['development', 'test'])(
    'may be enabled with NODE_ENV=%s',
    (nodeEnv) => {
      expect(
        validateMockRoutes({ NODE_ENV: nodeEnv, ENABLE_MOCK_ROUTES: 'true' }),
      ).toEqual({ errors: [], value: true });
    },
  );

  it('fails validation (and so boot) when true with NODE_ENV=production', () => {
    expect(
      validateMockRoutes({ NODE_ENV: 'production', ENABLE_MOCK_ROUTES: 'true' })
        .errors,
    ).toEqual(['ENABLE_MOCK_ROUTES must not be true when NODE_ENV=production']);
  });
});

describe('env schema: Bull Board', () => {
  const SECRET_32 = 'x'.repeat(32);

  it.each([
    ['missing', {}],
    ['empty', { BULL_BOARD_ADMIN_SECRET: '' }],
  ])(
    'fails validation (and so boot) when the secret is %s with NODE_ENV=production',
    (_label, env) => {
      expect(
        validateKey('BULL_BOARD_ADMIN_SECRET', {
          NODE_ENV: 'production',
          ...env,
        }).errors,
      ).toEqual([
        'BULL_BOARD_ADMIN_SECRET is required when NODE_ENV=production',
      ]);
    },
  );

  it('rejects a production secret shorter than 32 characters', () => {
    expect(
      validateKey('BULL_BOARD_ADMIN_SECRET', {
        NODE_ENV: 'production',
        BULL_BOARD_ADMIN_SECRET: 'x'.repeat(31),
      }).errors,
    ).toEqual([
      'BULL_BOARD_ADMIN_SECRET must be at least 32 characters when NODE_ENV=production',
    ]);
  });

  it('accepts a 32-character production secret', () => {
    expect(
      validateKey('BULL_BOARD_ADMIN_SECRET', {
        NODE_ENV: 'production',
        BULL_BOARD_ADMIN_SECRET: SECRET_32,
      }),
    ).toEqual({ errors: [], value: SECRET_32 });
  });

  it.each(['development', 'test'])(
    'is optional with NODE_ENV=%s (the dashboard then binds to loopback)',
    (nodeEnv) => {
      expect(
        validateKey('BULL_BOARD_ADMIN_SECRET', { NODE_ENV: nodeEnv }).errors,
      ).toEqual([]);
      expect(
        validateKey('BULL_BOARD_ADMIN_SECRET', {
          NODE_ENV: nodeEnv,
          BULL_BOARD_ADMIN_SECRET: '',
        }).errors,
      ).toEqual([]);
    },
  );

  it('is optional when NODE_ENV is unset (it defaults to development)', () => {
    expect(validateKey('BULL_BOARD_ADMIN_SECRET', {}).errors).toEqual([]);
  });

  it('defaults BULL_BOARD_PORT to 3010 and rejects an invalid port', () => {
    expect(validateKey('BULL_BOARD_PORT', {})).toEqual({
      errors: [],
      value: 3010,
    });
    expect(
      validateKey('BULL_BOARD_PORT', { BULL_BOARD_PORT: '70000' }).errors,
    ).toHaveLength(1);
  });
});
