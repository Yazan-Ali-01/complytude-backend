import type { Config } from 'jest';

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
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@lib/database$': '<rootDir>/../../libs/database/src',
    '^@lib/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@lib/queue$': '<rootDir>/../../libs/queue/src',
    '^@lib/queue/(.*)$': '<rootDir>/../../libs/queue/src/$1',
    '^@lib/redis$': '<rootDir>/../../libs/redis/src',
    '^@lib/redis/(.*)$': '<rootDir>/../../libs/redis/src/$1',
    '^@lib/embedding$': '<rootDir>/../../libs/embedding/src',
    '^@lib/embedding/(.*)$': '<rootDir>/../../libs/embedding/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
};

const config: Config = {
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
      testMatch: ['<rootDir>/**/*.integration.spec.ts'],
      // Runs via ts-node (package.json ts-node config). Required for .ts files outside Jest transform.
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
      setupFiles: ['<rootDir>/test/setup/jest.setup.ts'],
      testTimeout: 30000,
    },
  ],
  coverageDirectory: 'coverage',
  // Paths relative to repo root (jest.config.ts location)
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    '!apps/api/src/**/*.spec.ts',
    '!apps/api/src/**/*.integration.spec.ts',
  ],
  coverageProvider: 'v8',
};

export default config;
