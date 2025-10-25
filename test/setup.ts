import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Global setup for e2e tests
 * Runs once before all test suites
 */
export default async function globalSetup() {
  console.log('\n🔧 Setting up e2e test environment...\n');

  // Load test environment variables
  const testEnvPath = resolve(__dirname, 'test.env');
  if (existsSync(testEnvPath)) {
    config({ path: testEnvPath });
    console.log('✅ Loaded test environment variables');
  } else {
    console.warn('⚠️  test.env not found, using default environment');
  }

  // Wait for services to be ready (database, MinIO)
  await waitForServices();

  console.log('✅ E2E test environment ready\n');
}

/**
 * Wait for external services to be available
 */
async function waitForServices(): Promise<void> {
  const maxRetries = 30;
  const retryDelay = 1000;

  console.log('⏳ Waiting for services to be ready...');

  // Wait for database
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: 'postgres', // Connect to default DB first
        user: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
      });

      await pool.query('SELECT 1');
      await pool.end();
      console.log('✅ Database connection successful');
      break;
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error('❌ Database connection failed:', error);
        throw new Error('Database not available');
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  // Create test database if it doesn't exist
  await createTestDatabase();

  // Run migrations on test database
  await runMigrations();

  // Setup MinIO bucket for storage tests
  await setupMinioBucket();
}

/**
 * Create test database if it doesn't exist
 */
async function createTestDatabase(): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: 'postgres',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  });

  try {
    const dbName = process.env.DATABASE_NAME || 'complytude_test';

    // Check if test database exists
    const result = await pool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );

    if (result.rows.length === 0) {
      await pool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Created test database: ${dbName}`);
    } else {
      console.log(`✅ Test database exists: ${dbName}`);
    }
  } catch (error) {
    console.error('❌ Failed to create test database:', error);
  } finally {
    await pool.end();
  }
}

/**
 * Run migrations on test database
 */
async function runMigrations(): Promise<void> {
  const { Pool } = await import('pg');
  const { readdir, readFile } = await import('fs/promises');
  const { join } = await import('path');

  const pool = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'complytude_test',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
  });

  try {
    const migrationsDir = join(__dirname, '../scripts/migrations');

    // Read all migration files
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

    console.log(`⏳ Running ${sqlFiles.length} migrations...`);

    for (const file of sqlFiles) {
      try {
        const filePath = join(migrationsDir, file);
        const sql = await readFile(filePath, 'utf-8');
        await pool.query(sql);
        console.log(`   ✅ ${file}`);
      } catch (error: any) {
        // Ignore errors for migrations already applied
        if (
          error.code !== '42P07' && // relation already exists
          error.code !== '42710' && // object already exists
          error.code !== '23505' // unique violation
        ) {
          console.warn(`   ⚠️  ${file}: ${error.message}`);
        }
      }
    }

    console.log('✅ Migrations completed');
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
  } finally {
    await pool.end();
  }
}

/**
 * Setup MinIO bucket for storage tests
 */
async function setupMinioBucket(): Promise<void> {
  try {
    const { Client } = await import('@aws-sdk/client-s3');
    const { S3Client, CreateBucketCommand, HeadBucketCommand } =
      await import('@aws-sdk/client-s3');

    const bucketName = process.env.MINIO_BUCKET_NAME || 'complytude-test';
    const endpoint = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`;

    const s3Client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

    // Check if bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      console.log(`✅ MinIO bucket exists: ${bucketName}`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Create bucket
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        console.log(`✅ Created MinIO bucket: ${bucketName}`);
      } else {
        console.warn(`⚠️  MinIO setup skipped: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.warn('⚠️  MinIO not available, storage tests may fail:', error.message);
  }
}
