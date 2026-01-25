import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { TestDatabase } from './test-database';
import { ConnectionPoolHealthCheck } from './health-checks';
import multipart from '@fastify/multipart';

/**
 * Test context manager
 * Provides a singleton app instance for all tests
 */
export class TestContext {
  private static instance: TestContext;
  private app: NestFastifyApplication | null = null;
  private module: TestingModule | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TestContext {
    if (!TestContext.instance) {
      TestContext.instance = new TestContext();
    }

    return TestContext.instance;
  }

  /**
   * Initialize the test application
   */
  async initialize(): Promise<NestFastifyApplication> {
    if (this.app) {
      return this.app;
    }

    console.log('🚀 Initializing test application...');

    // Create test module
    this.module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Create Fastify application
    const fastifyAdapter = new FastifyAdapter();

    this.app =
      this.module.createNestApplication<NestFastifyApplication>(fastifyAdapter);

    // Register multipart for file uploads
    await this.app.register(multipart, {
      limits: {
        fileSize: 10485760, // 10MB
        files: 1,
      },
    });

    // Enable CORS
    this.app.enableCors({
      origin: true,
      credentials: true,
    });

    // Set global prefix
    this.app.setGlobalPrefix('api');

    // Enable validation globally
    this.app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Initialize the application
    await this.app.init();
    await this.app.getHttpAdapter().getInstance().ready();

    // Inject app's DatabaseService into TestDatabase for shared connection pool
    const databaseService = this.app.get(DatabaseService);
    TestDatabase.setAppDatabaseService(databaseService);

    // Run connection pool health checks in test environment
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_HEALTH_CHECKS === 'true'
    ) {
      try {
        await ConnectionPoolHealthCheck.runAll(databaseService);
      } catch (error) {
        console.error(
          '❌ Connection pool health check failed:',
          error instanceof Error ? error.message : error,
        );
        // Don't fail initialization, but log the warning
      }
    }

    console.log('✅ Test application initialized');

    return this.app;
  }

  /**
   * Get the application instance
   */
  getApp(): NestFastifyApplication {
    if (!this.app) {
      throw new Error(
        'Test application not initialized. Call initialize() first.',
      );
    }

    return this.app;
  }

  /**
   * Get the test module
   */
  getModule(): TestingModule {
    if (!this.module) {
      throw new Error('Test module not initialized. Call initialize() first.');
    }

    return this.module;
  }

  /**
   * Close the application
   */
  async close(): Promise<void> {
    if (this.app) {
      try {
        // Close the NestJS application
        await this.app.close();

        // Close the underlying Fastify instance
        const fastifyInstance = this.app.getHttpAdapter().getInstance();
        if (fastifyInstance && typeof fastifyInstance.close === 'function') {
          await fastifyInstance.close();
        }

        this.app = null;
        this.module = null;
        console.log('✅ Test application closed');
      } catch (error) {
        console.warn('⚠️  Error closing test application:', error);
        this.app = null;
        this.module = null;
      }
    }
  }

  /**
   * Get HTTP server for supertest
   */
  getHttpServer() {
    return this.getApp().getHttpServer();
  }
}

/**
 * Helper function to create test application
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const context = TestContext.getInstance();
  return context.initialize();
}

/**
 * Helper function to get test application
 */
export function getTestApp(): NestFastifyApplication {
  const context = TestContext.getInstance();
  return context.getApp();
}

/**
 * Helper function to close test application
 */
export async function closeTestApp(): Promise<void> {
  const context = TestContext.getInstance();
  await context.close();
}
