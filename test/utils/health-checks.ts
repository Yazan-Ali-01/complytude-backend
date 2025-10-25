import { TestDatabase } from './test-database';
import type { DatabaseService } from '../../src/database/database.service';

/**
 * Connection Pool Health Checks
 * Ensures database connections are healthy and visible across test and app contexts
 */
export class ConnectionPoolHealthCheck {
  /**
   * Verify app's DatabaseService is properly injected
   */
  static async verifyDatabaseServiceInjection(
    appDbService: DatabaseService,
  ): Promise<void> {
    try {
      const result = await appDbService.query('SELECT 1 as health_check');
      if (!result.rows || result.rows[0]?.health_check !== 1) {
        throw new Error('Database health check failed');
      }
    } catch (error) {
      throw new Error(
        `App DatabaseService health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verify test pool connection
   */
  static async verifyTestPoolConnection(): Promise<void> {
    try {
      const result = await TestDatabase.query('SELECT 1 as health_check');
      if (!result.rows || result.rows[0]?.health_check !== 1) {
        throw new Error('Test pool health check failed');
      }
    } catch (error) {
      throw new Error(
        `Test pool health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Verify transaction visibility between test and app connections
   * Tests that writes via app's DatabaseService are visible to test pool
   */
  static async verifyTransactionVisibility(
    appDbService: DatabaseService,
  ): Promise<void> {
    const testTableName = `health_check_${Date.now()}`;

    try {
      // Create test table via app's DatabaseService
      await appDbService.query(
        `CREATE TEMP TABLE ${testTableName} (id INT, value TEXT)`,
      );

      // Insert via app's DatabaseService
      await appDbService.query(
        `INSERT INTO ${testTableName} (id, value) VALUES (1, 'test')`,
      );

      // Try to read via test pool
      const result = await TestDatabase.query(
        `SELECT * FROM ${testTableName} WHERE id = 1`,
      );

      if (!result.rows || result.rows.length === 0) {
        throw new Error(
          'Transaction visibility issue: Data written via app not visible to test pool',
        );
      }

      // Cleanup
      await appDbService.query(`DROP TABLE ${testTableName}`);
    } catch (error) {
      throw new Error(
        `Transaction visibility check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Run all health checks
   */
  static async runAll(appDbService: DatabaseService): Promise<void> {
    console.log('🏥 Running connection pool health checks...');

    await this.verifyDatabaseServiceInjection(appDbService);
    console.log('  ✅ App DatabaseService injection verified');

    await this.verifyTestPoolConnection();
    console.log('  ✅ Test pool connection verified');

    await this.verifyTransactionVisibility(appDbService);
    console.log('  ✅ Transaction visibility verified');

    console.log('✅ All connection pool health checks passed\n');
  }
}

