import { validationSchema } from './env.schema';

function validateMockRoutes(env: Record<string, string>): {
  errors: string[];
  value: unknown;
} {
  const { error, value } = validationSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  }) as {
    error?: { details: { path: (string | number)[]; message: string }[] };
    value: Record<string, unknown>;
  };
  return {
    errors: (error?.details ?? [])
      .filter((d) => d.path[0] === 'ENABLE_MOCK_ROUTES')
      .map((d) => d.message),
    value: value.ENABLE_MOCK_ROUTES,
  };
}

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
