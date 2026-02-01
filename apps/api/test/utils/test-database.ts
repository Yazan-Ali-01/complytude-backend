import { Pool, PoolClient } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';

/**
 * Test Database Utilities
 * Provides helpers for database operations in tests
 *
 * Uses shared DatabaseService from app when available to avoid
 * transaction isolation issues. Falls back to separate pool for
 * cleanup operations.
 */
export class TestDatabase {
  private static pool: Pool;
  private static appDatabaseService: DatabaseService | null = null;

  /**
   * Set the app's DatabaseService for shared connection pool
   * This ensures test DB operations are visible to the app
   */
  static setAppDatabaseService(service: DatabaseService): void {
    this.appDatabaseService = service;
  }

  /**
   * Initialize database pool
   */
  static initialize(): void {
    if (!this.pool) {
      this.pool = new Pool({
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: process.env.DATABASE_NAME || 'complytude_test',
        user: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
      });
    }
  }

  /**
   * Get database pool
   */
  static getPool(): Pool {
    if (!this.pool) {
      this.initialize();
    }

    return this.pool;
  }

  /**
   * Execute a query
   */
  static async query(sql: string, params: any[] = []): Promise<any> {
    const pool = this.getPool();
    return pool.query(sql, params);
  }

  /**
   * Get a client from the pool
   */
  static async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return pool.connect();
  }

  /**
   * Clean up test user by email
   */
  static async cleanupUser(email: string): Promise<void> {
    try {
      // Get user's tenant associations
      const userQuery = await this.query(
        'SELECT id FROM public.users WHERE email = $1',
        [email],
      );

      if (userQuery.rows.length === 0) {
        return;
      }

      const userId = userQuery.rows[0].id;

      // Delete user's tenant associations
      await this.query('DELETE FROM public.user_tenants WHERE user_id = $1', [
        userId,
      ]);

      // Delete user
      await this.query('DELETE FROM public.users WHERE id = $1', [userId]);

      console.log(`✅ Cleaned up user: ${email}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup user ${email}:`, error);
    }
  }

  /**
   * Clean up test tenant by ID
   */
  static async cleanupTenant(tenantId: string): Promise<void> {
    try {
      // Get tenant schema name
      const tenantQuery = await this.query(
        'SELECT schema_name FROM public.tenants WHERE tenant_id = $1',
        [tenantId],
      );

      if (tenantQuery.rows.length === 0) {
        return;
      }

      const schemaName = tenantQuery.rows[0].schema_name;

      // Drop tenant schema
      await this.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);

      // Delete user-tenant associations
      await this.query('DELETE FROM public.user_tenants WHERE tenant_id = $1', [
        tenantId,
      ]);

      // Delete tenant record
      await this.query('DELETE FROM public.tenants WHERE tenant_id = $1', [
        tenantId,
      ]);

      console.log(`✅ Cleaned up tenant: ${tenantId}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup tenant ${tenantId}:`, error);
    }
  }

  /**
   * Clean up test authority by ID
   */
  static async cleanupAuthority(authorityId: string): Promise<void> {
    try {
      await this.query('DELETE FROM public.legal_authorities WHERE id = $1', [
        authorityId,
      ]);

      console.log(`✅ Cleaned up authority: ${authorityId}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup authority ${authorityId}:`, error);
    }
  }

  /**
   * Clean up test category by ID
   */
  static async cleanupCategory(categoryId: string): Promise<void> {
    try {
      await this.query('DELETE FROM public.template_categories WHERE id = $1', [
        categoryId,
      ]);

      console.log(`✅ Cleaned up category: ${categoryId}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup category ${categoryId}:`, error);
    }
  }

  /**
   * Clean up test ruleset by key
   */
  static async cleanupRuleset(rulesetKey: string): Promise<void> {
    try {
      await this.query('DELETE FROM public.legal_rulesets WHERE key = $1', [
        rulesetKey,
      ]);

      console.log(`✅ Cleaned up ruleset: ${rulesetKey}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup ruleset ${rulesetKey}:`, error);
    }
  }

  /**
   * Clean up test template by key
   */
  static async cleanupTemplate(templateKey: string): Promise<void> {
    try {
      await this.query('DELETE FROM public.templates WHERE key = $1', [
        templateKey,
      ]);

      console.log(`✅ Cleaned up template: ${templateKey}`);
    } catch (error) {
      console.error(`❌ Failed to cleanup template ${templateKey}:`, error);
    }
  }

  /**
   * Clean up all test data (use with caution!)
   */
  static async cleanupAllTestData(): Promise<void> {
    try {
      console.log('🧹 Cleaning up all test data...');

      // Delete test users (emails containing 'test.complytude.com')
      await this.query(
        "DELETE FROM public.users WHERE email LIKE '%test.complytude.com'",
      );

      // Delete test tenants (names starting with 'test_tenant_')
      const testTenants = await this.query(
        "SELECT tenant_id, schema_name FROM public.tenants WHERE email LIKE '%test.complytude.com'",
      );

      for (const tenant of testTenants.rows) {
        await this.query(`DROP SCHEMA IF EXISTS ${tenant.schema_name} CASCADE`);
        await this.query('DELETE FROM public.tenants WHERE tenant_id = $1', [
          tenant.tenant_id,
        ]);
      }

      // Delete test authorities (if table exists)
      try {
        await this.query(
          "DELETE FROM public.legal_authorities WHERE code LIKE 'TEST_%'",
        );
      } catch (error: any) {
        if (error.code !== '42P01') throw error; // Ignore table not found
      }

      // Delete test categories (if table exists)
      try {
        await this.query(
          "DELETE FROM public.template_categories WHERE code LIKE 'test_%'",
        );
      } catch (error: any) {
        if (error.code !== '42P01') throw error;
      }

      // Delete test rulesets (if table exists)
      try {
        await this.query(
          "DELETE FROM public.legal_rulesets WHERE key LIKE 'test_%'",
        );
      } catch (error: any) {
        if (error.code !== '42P01') throw error;
      }

      // Delete test templates (if table exists)
      try {
        await this.query(
          "DELETE FROM public.templates WHERE key LIKE 'test_%'",
        );
      } catch (error: any) {
        if (error.code !== '42P01') throw error;
      }

      console.log('✅ All test data cleaned up');
    } catch (error) {
      console.error('❌ Failed to cleanup test data:', error);
      throw error;
    }
  }

  /**
   * Get user by email
   * Uses shared DatabaseService when available for transaction visibility
   */
  static async getUserByEmail(email: string): Promise<any> {
    const query = 'SELECT * FROM public.users WHERE email = $1';
    const params = [email];

    let result;
    if (this.appDatabaseService) {
      result = await this.appDatabaseService.query(query, params);
    } else {
      result = await this.query(query, params);
    }

    return result.rows[0] || null;
  }

  /**
   * Get email verification token for user
   * Uses shared DatabaseService when available for transaction visibility
   */
  static async getVerificationToken(email: string): Promise<string | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    const query = `SELECT token FROM public.email_verifications 
       WHERE user_id = $1 
       AND expires_at > NOW() 
       ORDER BY created_at DESC 
       LIMIT 1`;
    const params = [user.id];

    let result;
    if (this.appDatabaseService) {
      result = await this.appDatabaseService.query(query, params);
    } else {
      result = await this.query(query, params);
    }

    return result.rows[0]?.token || null;
  }

  /**
   * Get tenant by ID
   * Uses shared DatabaseService when available for transaction visibility
   */
  static async getTenantById(tenantId: string): Promise<any> {
    const query = 'SELECT * FROM public.tenants WHERE tenant_id = $1';
    const params = [tenantId];

    let result;
    if (this.appDatabaseService) {
      result = await this.appDatabaseService.query(query, params);
    } else {
      result = await this.query(query, params);
    }

    return result.rows[0] || null;
  }

  /**
   * Get detailed tenant information for debugging
   */
  static async getTenantDebugInfo(tenantId: string): Promise<any> {
    const query = `
      SELECT 
        tenant_id,
        plan,
        features,
        features::text as features_raw,
        is_active,
        created_at,
        updated_at
      FROM public.tenants 
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    let result;
    if (this.appDatabaseService) {
      result = await this.appDatabaseService.query(query, params);
    } else {
      result = await this.query(query, params);
    }

    const tenant = result.rows[0] || null;
    if (tenant) {
      console.log(`🔍 [DEBUG] Tenant ${tenantId} database state:`, {
        tenant_id: tenant.tenant_id,
        plan: tenant.plan,
        features: tenant.features,
        features_raw: tenant.features_raw,
        features_type: typeof tenant.features,
        is_active: tenant.is_active,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at,
      });
    }

    return tenant;
  }

  /**
   * Check if tenant schema exists
   * Uses shared DatabaseService when available for transaction visibility
   */
  static async tenantSchemaExists(schemaName: string): Promise<boolean> {
    const query =
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1';
    const params = [schemaName];

    let result;
    if (this.appDatabaseService) {
      result = await this.appDatabaseService.query(query, params);
    } else {
      result = await this.query(query, params);
    }

    return result.rows.length > 0;
  }

  /**
   * Set user as system admin (for testing)
   * Uses app's DatabaseService to ensure changes are immediately visible
   */
  static async setSystemAdmin(userId: string, isAdmin = true): Promise<void> {
    if (!this.appDatabaseService) {
      throw new Error(
        'App DatabaseService not set. Call TestDatabase.setAppDatabaseService() in test setup.',
      );
    }

    // Use app's DatabaseService for immediate visibility
    const updateResult = await this.appDatabaseService.query(
      'UPDATE public.users SET is_system_admin = $1 WHERE id = $2',
      [isAdmin, userId],
    );

    if (updateResult.rowCount === 0) {
      throw new Error(
        `User ${userId} not found. Update affected 0 rows. User may not exist yet.`,
      );
    }

    // Verify the update using the same connection pool
    const result = await this.appDatabaseService.query(
      'SELECT id, email, is_system_admin FROM public.users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new Error(`User ${userId} not found after update`);
    }

    if (result.rows[0]?.is_system_admin !== isAdmin) {
      throw new Error(
        `Failed to set system admin flag. Expected: ${isAdmin}, Got: ${result.rows[0]?.is_system_admin}`,
      );
    }

    console.log(`✅ Set user ${userId} as system admin: ${isAdmin}`);
  }

  /**
   * Close database pool
   */
  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Database pool closed');
    }
  }
}
