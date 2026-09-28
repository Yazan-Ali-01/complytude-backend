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
    '^@lib/context$': '<rootDir>/../../libs/context/src/index.ts',
    '^@lib/context/(.*)$': '<rootDir>/../../libs/context/src/$1',
    '^@lib/database$': '<rootDir>/../../libs/database/src/index.ts',
    '^@lib/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@lib/logger$': '<rootDir>/../../libs/logger/src/index.ts',
    '^@lib/logger/(.*)$': '<rootDir>/../../libs/logger/src/$1',
    '^@lib/queue$': '<rootDir>/../../libs/queue/src/index.ts',
    '^@lib/queue/(.*)$': '<rootDir>/../../libs/queue/src/$1',
    '^@lib/redis$': '<rootDir>/../../libs/redis/src/index.ts',
    '^@lib/redis/(.*)$': '<rootDir>/../../libs/redis/src/$1',
    '^@lib/embedding$': '<rootDir>/../../libs/embedding/src/index.ts',
    '^@lib/embedding/(.*)$': '<rootDir>/../../libs/embedding/src/$1',
    '^@lib/audit$': '<rootDir>/../../libs/audit/src/index.ts',
    '^@lib/audit/(.*)$': '<rootDir>/../../libs/audit/src/$1',
    '^@lib/storage$': '<rootDir>/../../libs/storage/src/index.ts',
    '^@lib/storage/(.*)$': '<rootDir>/../../libs/storage/src/$1',
    '^@lib/pdf$': '<rootDir>/../../libs/pdf/src/index.ts',
    '^@lib/pdf/(.*)$': '<rootDir>/../../libs/pdf/src/$1',
    '^@lib/docx-renderer$': '<rootDir>/../../libs/docx-renderer/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
};

const skipIntegrationBootstrap =
  process.env.JEST_SKIP_INTEGRATION_BOOTSTRAP === '1';

const libsUnitProjectConfig = {
  displayName: 'unit',
  rootDir: '<rootDir>/libs',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest', swcTransformConfig],
  },
  moduleNameMapper: {
    '^@lib/context$': '<rootDir>/context/src/index.ts',
    '^@lib/context/(.*)$': '<rootDir>/context/src/$1',
    '^@lib/logger$': '<rootDir>/logger/src/index.ts',
    '^@lib/logger/(.*)$': '<rootDir>/logger/src/$1',
    '^@lib/database$': '<rootDir>/database/src/index.ts',
    '^@lib/database/(.*)$': '<rootDir>/database/src/$1',
    '^@lib/queue$': '<rootDir>/queue/src/index.ts',
    '^@lib/queue/(.*)$': '<rootDir>/queue/src/$1',
    '^@lib/redis$': '<rootDir>/redis/src/index.ts',
    '^@lib/redis/(.*)$': '<rootDir>/redis/src/$1',
    '^@lib/embedding$': '<rootDir>/embedding/src/index.ts',
    '^@lib/embedding/(.*)$': '<rootDir>/embedding/src/$1',
    '^@lib/audit$': '<rootDir>/audit/src/index.ts',
    '^@lib/audit/(.*)$': '<rootDir>/audit/src/$1',
    '^@lib/storage$': '<rootDir>/storage/src/index.ts',
    '^@lib/storage/(.*)$': '<rootDir>/storage/src/$1',
    '^@lib/pdf$': '<rootDir>/pdf/src/index.ts',
    '^@lib/pdf/(.*)$': '<rootDir>/pdf/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
};

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
      displayName: 'worker-ingestion-unit',
      rootDir: '<rootDir>/apps/worker-ingestion',
      transform: {
        '^.+\\.(t|j)s$': ['@swc/jest', swcTransformConfig],
      },
      moduleNameMapper: {
        '^@lib/context$': '<rootDir>/../../libs/context/src/index.ts',
        '^@lib/context/(.*)$': '<rootDir>/../../libs/context/src/$1',
        '^@lib/database$': '<rootDir>/../../libs/database/src/index.ts',
        '^@lib/database/(.*)$': '<rootDir>/../../libs/database/src/$1',
        '^@lib/logger$': '<rootDir>/../../libs/logger/src/index.ts',
        '^@lib/logger/(.*)$': '<rootDir>/../../libs/logger/src/$1',
        '^@lib/queue$': '<rootDir>/../../libs/queue/src/index.ts',
        '^@lib/queue/(.*)$': '<rootDir>/../../libs/queue/src/$1',
        '^@lib/redis$': '<rootDir>/../../libs/redis/src/index.ts',
        '^@lib/redis/(.*)$': '<rootDir>/../../libs/redis/src/$1',
        '^@lib/embedding$': '<rootDir>/../../libs/embedding/src/index.ts',
        '^@lib/embedding/(.*)$': '<rootDir>/../../libs/embedding/src/$1',
        '^@lib/storage$': '<rootDir>/../../libs/storage/src/index.ts',
        '^@lib/storage/(.*)$': '<rootDir>/../../libs/storage/src/$1',
        '^@lib/pdf$': '<rootDir>/../../libs/pdf/src/index.ts',
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
    },
    libsUnitProjectConfig,
    {
      ...sharedProjectConfig,
      displayName: 'integration',
      rootDir: '<rootDir>/apps/api',
      roots: ['<rootDir>', '<rootDir>/../../libs'],
      moduleDirectories: ['node_modules', '<rootDir>', '<rootDir>/../../libs'],
      moduleNameMapper: {
        ...sharedProjectConfig.moduleNameMapper,
        '^uuid$': '<rootDir>/test/mocks/uuid.mock.ts',
      },
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
    'libs/*/src/**/*.ts',
    '!libs/*/src/**/*.spec.ts',
  ],
  coverageProvider: 'v8',
};

export default config;
