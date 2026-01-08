import { Injectable, Logger } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import {
  QueryOptions,
  CursorPaginationOptions,
  CursorPaginationResult,
} from '../base/repository.interface';
import {
  Tenant,
  TenantFeatures,
  TenantSchema,
} from 'src/modules/tenant/entities/tenant.entity';
import { CursorPaginationHelper } from '../base/cursor-pagination.helper';

/**
 * Type for creating a new tenant row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type CreateTenantRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: string; // Stringified JSONB
  schema_name: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing tenant row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type UpdateTenantRow = {
  email?: string;
  role?: 'admin' | 'user' | 'viewer';
  plan?: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features?: string; // Stringified JSONB
  schema_name?: string;
  is_active?: boolean;
  updated_at?: Date;
};

type TenantRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';
  features: unknown;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type TenantSchemaRow = {
  tenant_id: string;
  schema_name: string;
  is_active: boolean;
  created_at: Date;
};

/**
 * Repository for managing Tenant entities and their infrastructure.
 * Handles database operations for tenants, including schema creation and isolation.
 */
@Injectable()
export class TenantRepository extends BaseRepository<
  Tenant,
  CreateTenantRow,
  UpdateTenantRow
> {
  private readonly tenantLogger = new Logger(TenantRepository.name);

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.tenants');
  }

  /**
   * Find tenants with cursor-based pagination.
   * Supports filtering by is_active and tenant_id.
   *
   * @param filters - Optional filters for is_active and tenant_id
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { is_active?: boolean; tenant_id?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Tenant>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      conditions.push(`tenant_id = $${params.length}`);
    }

    // Add cursor condition using helper
    const cursorQuery = CursorPaginationHelper.buildCursorQuery(
      direction,
      cursor,
      params.length + 1,
    );

    if (cursorQuery.clause) {
      conditions.push(cursorQuery.clause);
      params.push(...cursorQuery.params);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitClause = CursorPaginationHelper.buildLimitClause(
      limit,
      params.length + 1,
    );
    params.push(...limitClause.params);

    const query =
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ${cursorQuery.orderClause} ${limitClause.clause}`.trim();
    const result = await this.executeQuery<TenantRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all active tenants.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 active tenants.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of active tenants
   */
  async findActive(options?: QueryOptions): Promise<Tenant[]> {
    const result = await this.findMany(
      { is_active: true },
      { limit: 1000 },
      options,
    );
    return result.data;
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, tenant_id, email, role, plan, features, schema_name, is_active, created_at, updated_at';
  }

  /**
   * Map a database row to a Tenant domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Tenant entity
   */
  protected mapRow(row: Record<string, unknown>): Tenant {
    const data = row as TenantRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      email: data.email,
      role: data.role,
      plan: data.plan,
      features: data.features as TenantFeatures,
      schema_name: data.schema_name,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Initialize the global infrastructure tables for multi-tenancy.
   * Creates tenants and tenant_schemas tables, indexes, and RLS policies.
   *
   * @param options - Query options
   */
  async initializeInfrastructure(options?: QueryOptions): Promise<void> {
    this.tenantLogger.debug('Initializing tenant infrastructure');
    const queryOptions = { ...options, bypassRLS: true };

    this.tenantLogger.debug('Creating public.tenants table');
    await this.executeQuery(
      `
        CREATE TABLE IF NOT EXISTS public.tenants (
          id VARCHAR(255) PRIMARY KEY,
          tenant_id VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
          plan VARCHAR(50) NOT NULL CHECK (plan IN ('early_access', 'basic', 'pro', 'enterprise')),
          features JSONB NOT NULL DEFAULT '{}',
          schema_name VARCHAR(255) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      [],
      queryOptions,
    );

    this.tenantLogger.debug('Creating public.tenant_schemas table');
    await this.executeQuery(
      `
        CREATE TABLE IF NOT EXISTS public.tenant_schemas (
          tenant_id VARCHAR(255) PRIMARY KEY REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
          schema_name VARCHAR(255) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      [],
      queryOptions,
    );

    this.tenantLogger.debug('Creating indexes for tenants and tenant_schemas');
    await this.executeQuery(
      `
        CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON public.tenants(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_tenants_email ON public.tenants(email);
        CREATE INDEX IF NOT EXISTS idx_tenant_schemas_tenant_id ON public.tenant_schemas(tenant_id);
      `,
      [],
      queryOptions,
    );

    this.tenantLogger.debug('Enabling Row Level Security on public.tenants');
    await this.executeQuery(
      `ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;`,
      [],
      queryOptions,
    );

    this.tenantLogger.debug('Creating tenant isolation RLS policy');
    await this.executeQuery(
      `
        DROP POLICY IF EXISTS tenant_isolation_policy ON public.tenants;
        CREATE POLICY tenant_isolation_policy ON public.tenants
          USING (tenant_id = current_setting('app.current_tenant_id', true));
      `,
      [],
      queryOptions,
    );
    this.tenantLogger.debug('Tenant infrastructure initialized successfully');
  }

  /**
   * Update a tenant by its unique tenant_id.
   *
   * @param tenantId - The tenant's unique identifier (not primary key ID)
   * @param data - Partial tenant data to update (JSON fields must be pre-stringified)
   * @param options - Query options
   * @returns Updated Tenant entity or null if not found
   */
  async updateByTenantId(
    tenantId: string,
    data: UpdateTenantRow,
    options?: QueryOptions,
  ): Promise<Tenant | null> {
    this.tenantLogger.debug(
      `Updating tenant: tenant_id=${tenantId}, fields=${Object.keys(data).join(', ')}`,
    );
    const tenant = await this.findOne({
      filters: {
        tenant_id: tenantId,
      },
      select: ['id', 'tenant_id'],
    });
    if (!tenant) {
      return null;
    }
    return this.update(tenant.id, data, options);
  }

  /**
   * Delete a tenant by its unique tenant_id.
   *
   * @param tenantId - The tenant's unique identifier
   * @param options - Query options
   * @returns Number of rows deleted (0 if not found)
   */
  async deleteByTenantId(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    this.tenantLogger.debug(`Deleting tenant: tenant_id=${tenantId}`);
    const tenant = await this.findOne({
      filters: {
        tenant_id: tenantId,
      },
      select: ['id', 'tenant_id'],
    });
    if (!tenant) {
      return 0;
    }
    return await this.delete(tenant.id, options);
  }

  /**
   * Create a record in the tenant_schemas table linking a tenant to a schema.
   *
   * @param tenantId - The tenant ID
   * @param schemaName - The database schema name
   * @param options - Query options
   */
  async createTenantSchemaRecord(
    tenantId: string,
    schemaName: string,
    options?: QueryOptions,
  ): Promise<void> {
    this.tenantLogger.debug(
      `Creating tenant schema record: tenant_id=${tenantId}, schema=${schemaName}`,
    );
    await this.executeQuery(
      `
        INSERT INTO public.tenant_schemas (tenant_id, schema_name, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (tenant_id) DO NOTHING
      `,
      [tenantId, schemaName],
      options,
    );
    this.tenantLogger.debug(
      `Tenant schema record created: tenant_id=${tenantId}, schema=${schemaName}`,
    );
  }

  /**
   * Retrieve schema information for a specific tenant.
   *
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns TenantSchema object or null if not found
   */
  async getTenantSchema(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<TenantSchema | null> {
    this.tenantLogger.debug(`Getting tenant schema: tenant_id=${tenantId}`);
    const result = await this.executeQuery<TenantSchemaRow>(
      'SELECT tenant_id, schema_name, is_active, created_at FROM public.tenant_schemas WHERE tenant_id = $1',
      [tenantId],
      options,
    );

    const row = result.rows[0];
    const schema = row
      ? {
          tenant_id: row.tenant_id,
          schema_name: row.schema_name,
          is_active: row.is_active,
          created_at: row.created_at,
        }
      : null;
    this.tenantLogger.debug(
      `Tenant schema lookup: tenant_id=${tenantId}, ${schema ? `found schema=${schema.schema_name}` : 'not found'}`,
    );
    return schema;
  }

  /**
   * Create a new database schema and grant permissions.
   * Bypasses RLS to perform DDL operations.
   *
   * @param schemaName - Name of the schema to create
   * @param options - Query options
   */
  async createTenantSchema(
    schemaName: string,
    options?: QueryOptions,
  ): Promise<void> {
    this.tenantLogger.debug(`Creating tenant schema: schema=${schemaName}`);
    const queryOptions = { ...options, bypassRLS: true };
    await this.executeQuery(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      [],
      queryOptions,
    );
    this.tenantLogger.debug(`Granting USAGE on schema: schema=${schemaName}`);
    await this.executeQuery(
      `GRANT USAGE ON SCHEMA "${schemaName}" TO CURRENT_USER`,
      [],
      queryOptions,
    );
    this.tenantLogger.debug(`Granting CREATE on schema: schema=${schemaName}`);
    await this.executeQuery(
      `GRANT CREATE ON SCHEMA "${schemaName}" TO CURRENT_USER`,
      [],
      queryOptions,
    );
    this.tenantLogger.debug(
      `Tenant schema created successfully: schema=${schemaName}`,
    );
  }

  /**
   * Initialize tables and policies within a tenant's schema.
   * Sets up documents table and its RLS policies.
   *
   * @param schemaName - The schema name
   * @param tenantId - The tenant ID (for policy definitions)
   * @param options - Query options
   */
  async initializeTenantSchema(
    schemaName: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<void> {
    this.tenantLogger.debug(
      `Initializing tenant schema: schema=${schemaName}, tenant_id=${tenantId}`,
    );
    const queryOptions = { ...options, bypassRLS: true };
    this.tenantLogger.debug(
      `Creating documents table in schema: schema=${schemaName}`,
    );
    await this.executeQuery(
      `
        CREATE TABLE IF NOT EXISTS "${schemaName}".documents (
          id VARCHAR(255) PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          content TEXT,
          metadata JSONB DEFAULT '{}',
          template_key VARCHAR(255),
          template_version VARCHAR(50),
          generation_metadata JSONB,
          created_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)
        );
      `,
      [],
      queryOptions,
    );

    this.tenantLogger.debug(
      `Enabling RLS on documents table: schema=${schemaName}`,
    );
    await this.executeQuery(
      `ALTER TABLE "${schemaName}".documents ENABLE ROW LEVEL SECURITY;`,
      [],
      queryOptions,
    );

    this.tenantLogger.debug(
      `Creating tenant isolation policy: schema=${schemaName}`,
    );
    await this.executeQuery(
      `
          DROP POLICY IF EXISTS documents_tenant_isolation ON "${schemaName}".documents;
          CREATE POLICY documents_tenant_isolation ON "${schemaName}".documents
            USING (tenant_id = current_setting('app.current_tenant_id', true));
        `,
      [],
      queryOptions,
    );

    this.tenantLogger.debug(
      `Creating indexes on documents table: schema=${schemaName}`,
    );
    await this.executeQuery(
      `
        CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON "${schemaName}".documents(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_documents_template_key ON "${schemaName}".documents(template_key);
      `,
      [],
      queryOptions,
    );
    this.tenantLogger.debug(
      `Tenant schema initialized successfully: schema=${schemaName}, tenant_id=${tenantId}`,
    );
  }

  /**
   * Drop a tenant's schema and all its objects.
   *
   * @param schemaName - The schema name to drop
   * @param options - Query options
   */
  async dropTenantSchema(
    schemaName: string,
    options?: QueryOptions,
  ): Promise<void> {
    this.tenantLogger.debug(`Dropping tenant schema: schema=${schemaName}`);
    const queryOptions = { ...options, bypassRLS: true };
    await this.executeQuery(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      [],
      queryOptions,
    );
    this.tenantLogger.debug(
      `Tenant schema dropped successfully: schema=${schemaName}`,
    );
  }

  /**
   * Get the count of documents in a tenant's schema.
   * Checks for table existence first.
   *
   * @param schemaName - The schema name
   * @param options - Query options
   * @returns Number of documents
   */
  async getDocumentCount(
    schemaName: string,
    options?: QueryOptions,
  ): Promise<number> {
    this.tenantLogger.debug(`Getting document count: schema=${schemaName}`);
    const queryOptions = { ...options, bypassRLS: true };
    const tableExists = await this.executeQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = $1
          AND table_name = 'documents'
        ) as exists
      `,
      [schemaName],
      queryOptions,
    );

    if (!tableExists.rows[0]?.exists) {
      this.tenantLogger.debug(
        `Documents table does not exist: schema=${schemaName}, returning 0`,
      );
      return 0;
    }

    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${schemaName}".documents`,
      [],
      queryOptions,
    );

    const count = parseInt(result.rows[0].count, 10);
    this.tenantLogger.debug(
      `Document count: schema=${schemaName}, count=${count}`,
    );
    return count;
  }
}
