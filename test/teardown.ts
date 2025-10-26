/**
 * Global teardown for e2e tests
 * Runs once after all test suites complete
 */
export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up e2e test environment...\n');

  // Close test application if still open
  try {
    const { TestContext } = await import('./utils/test-context.js');
    const context = TestContext.getInstance();
    await context.close();
  } catch (error) {
    console.warn('⚠️  Error closing test context:', error);
  }

  // Wait a moment for graceful cleanup, then force close any remaining database connections
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    await forceCloseDatabaseConnections();
  } catch (error) {
    console.warn('⚠️  Error closing database connections:', error);
  }

  // Optional: Clean up test database
  // Uncomment if you want to drop the test database after tests
  // await dropTestDatabase();

  console.log('✅ E2E test environment cleaned up\n');
}

/**
 * Force close any remaining database connections
 */
async function forceCloseDatabaseConnections(): Promise<void> {
  try {
    const { Pool } = await import('pg');

    // Create a temporary pool to force close any remaining connections
    const tempPool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: 'postgres',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
    });

    // Terminate all connections to the test database
    const testDbName = process.env.DATABASE_NAME || 'complytude_test';
    await tempPool.query(
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `,
      [testDbName],
    );

    await tempPool.end();
    console.log('✅ Database connections force closed');
  } catch (error) {
    console.warn('⚠️  Could not force close database connections:', error);
  }
}
