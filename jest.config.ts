const swcTransformConfig = {
  jsc: {
    parser: {
      syntax: 'typescript',
      decorators: true,
    },
    transform: {
      legacyDecorator: true,
      decoratorMetadata: true,
    },
    keepClassNames: true,
    target: 'es2023',
  },
  module: {
    type: 'commonjs',
  },
};

const sharedProjectConfig = {
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest', swcTransformConfig],
  },
  moduleNameMapper: {
    '^file-type$': '<rootDir>/test/mocks/file-type.mock.ts',
    '^@nestjs/bullmq$':
      '<rootDir>/../../node_modules/@nestjs/bullmq/dist/index.js',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@lib/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@lib/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@lib/queue$': '<rootDir>/../../libs/queue/src/index.ts',
    '^@lib/queue/(.*)$': '<rootDir>/../../libs/queue/src/$1',
    '^@lib/redis$': '<rootDir>/../../libs/redis/src/index.ts',
    '^@lib/redis/(.*)$': '<rootDir>/../../libs/redis/src/$1',
    '^@lib/embedding$': '<rootDir>/../../libs/embedding/src/index.ts',
    '^@lib/embedding/(.*)$': '<rootDir>/../../libs/embedding/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
};

const skipIntegrationBootstrap =
  process.env.JEST_SKIP_INTEGRATION_BOOTSTRAP === '1';

const config = {
  watchman: false,
  projects: [
    {
      ...sharedProjectConfig,
      displayName: 'unit',
      rootDir: '<rootDir>/apps/api',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
    },
    {
      ...sharedProjectConfig,
      displayName: 'integration',
      rootDir: '<rootDir>/apps/api',
      roots: ['<rootDir>', '<rootDir>/../../libs'],
      moduleDirectories: ['node_modules', '<rootDir>', '<rootDir>/../../libs'],
      transform: {
        '^.+\\.(t|j)s$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/../../tsconfig.json',
          },
        ],
      },
      testMatch: ['<rootDir>/**/*.integration.spec.ts'],
      // Runs via ts-node (package.json ts-node config). Required for .ts files outside Jest transform.
      globalSetup: skipIntegrationBootstrap
        ? undefined
        : '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: skipIntegrationBootstrap
        ? undefined
        : '<rootDir>/test/setup/global-teardown.ts',
      setupFiles: skipIntegrationBootstrap
        ? []
        : ['<rootDir>/test/setup/jest.setup.ts'],
      // Cap workers at 16 — each worker uses one Redis DB (0-15), Redis default limit
      maxWorkers: 16,
      // Integration tests hit real DBs and include resetTestState; 30s is a realistic per-test budget
      slowTestThreshold: 30000,
    },
  ],
  coverageDirectory: 'coverage',
  // Paths relative to repo root (jest.config.ts location)
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    '!apps/api/src/**/*.spec.ts',
    '!apps/api/src/**/*.integration.spec.ts',
    // TODO: Add libs/*/src/**/*.ts when lib-level tests or cross-lib coverage is needed
  ],
  coverageProvider: 'v8',
};

export default config;
