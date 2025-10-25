/**
 * Global teardown for e2e tests
 * Runs once after all test suites complete
 */
export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up e2e test environment...\n');

  // Close test application if still open
  try {
    const { TestContext } = await import('./utils/test-context');
    const context = TestContext.getInstance();
    await context.close();
  } catch (error) {
    // App might already be closed
  }

  // Optional: Clean up test database
  // Uncomment if you want to drop the test database after tests
  // await dropTestDatabase();

  console.log('✅ E2E test environment cleaned up\n');
}

/**
 * Drop test database (optional - use with caution)
 */
async function dropTestDatabase(): Promise<void> {
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

    // Terminate all connections to the test database
    await pool.query(
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `,
      [dbName],
    );

    // Drop the test database
    await pool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✅ Dropped test database: ${dbName}`);
  } catch (error) {
    console.error('❌ Failed to drop test database:', error);
  } finally {
    await pool.end();
  }
}
