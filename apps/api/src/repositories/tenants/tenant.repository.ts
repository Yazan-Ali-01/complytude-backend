import {
  BaseRepository,
  CursorPaginationHelper,
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
  QueryOptions,
} from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from 'src/modules/tenants/entities/tenant.entity';

/**
 * Type for creating a new tenant row in the database.
 */
export type CreateTenantRow = {
  id?: string;
  is_active?: boolean;
  parent_tenant_id?: string;
  name?: string | null;
  slug?: string | null;
  locale?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
  onboarding_metadata?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing tenant row in the database.
 */
export type UpdateTenantRow = {
  is_active?: boolean;
  parent_tenant_id?: string;
  name?: string | null;
  slug?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  billing_email?: string | null;
  contact_phone?: string | null;
  emirate?: string | null;
  city?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  postal_code?: string | null;
  trade_license_number?: string | null;
  legal_entity_type?: string | null;
  tax_registration_number?: string | null;
  locale?: string;
  timezone?: string;
  default_jurisdiction?: string | null;
  settings?: Record<string, unknown>;
  brand_color_primary?: string | null;
  brand_color_secondary?: string | null;
  deactivated_at?: Date | null;
  deactivation_reason?: string | null;
  onboarding_completed_at?: Date | null;
  onboarding_metadata?: Record<string, unknown>;
  updated_at?: Date;
};

type TenantRow = {
  id: string;
  is_active: boolean;
  parent_tenant_id?: string;
  name?: string | null;
  slug?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  billing_email?: string | null;
  contact_phone?: string | null;
  emirate?: string | null;
  city?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  postal_code?: string | null;
  trade_license_number?: string | null;
  legal_entity_type?: string | null;
  tax_registration_number?: string | null;
  locale: string;
  timezone: string;
  default_jurisdiction?: string | null;
  settings: Record<string, unknown>;
  brand_color_primary?: string | null;
  brand_color_secondary?: string | null;
  deactivated_at?: Date | null;
  deactivation_reason?: string | null;
  onboarding_completed_at?: Date | null;
  onboarding_metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
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
   * Supports filtering by is_active and id.
   *
   * @param filters - Optional filters for is_active and id
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { is_active?: boolean; id?: string } = {},
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
    if (filters.id) {
      params.push(filters.id);
      conditions.push(`id = $${params.length}`);
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

  async findBySlug(
    slug: string,
    options?: QueryOptions,
  ): Promise<Tenant | null> {
    const result = await this.executeQuery<TenantRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE slug = $1`,
      [slug],
      options,
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  async isSlugTaken(
    slug: string,
    excludeTenantId?: string,
    options?: QueryOptions,
  ): Promise<boolean> {
    const params: unknown[] = [slug];
    let query = `SELECT id FROM ${this.tableName} WHERE slug = $1`;

    if (excludeTenantId) {
      params.push(excludeTenantId);
      query += ` AND id != $2`;
    }

    const result = await this.executeQuery<{ id: string }>(
      query,
      params,
      options,
    );
    return result.rows.length > 0;
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return [
      'id',
      'is_active',
      'parent_tenant_id',
      'name',
      'slug',
      'logo_url',
      'contact_email',
      'billing_email',
      'contact_phone',
      'emirate',
      'city',
      'address_line_1',
      'address_line_2',
      'postal_code',
      'trade_license_number',
      'legal_entity_type',
      'tax_registration_number',
      'locale',
      'timezone',
      'default_jurisdiction',
      'settings',
      'brand_color_primary',
      'brand_color_secondary',
      'deactivated_at',
      'deactivation_reason',
      'onboarding_completed_at',
      'onboarding_metadata',
      'created_at',
      'updated_at',
    ].join(', ');
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
      is_active: data.is_active,
      parent_tenant_id: data.parent_tenant_id,
      name: data.name ?? null,
      slug: data.slug ?? null,
      logo_url: data.logo_url ?? null,
      contact_email: data.contact_email ?? null,
      billing_email: data.billing_email ?? null,
      contact_phone: data.contact_phone ?? null,
      emirate: data.emirate ?? null,
      city: data.city ?? null,
      address_line_1: data.address_line_1 ?? null,
      address_line_2: data.address_line_2 ?? null,
      postal_code: data.postal_code ?? null,
      trade_license_number: data.trade_license_number ?? null,
      legal_entity_type: data.legal_entity_type ?? null,
      tax_registration_number: data.tax_registration_number ?? null,
      locale: data.locale ?? 'en',
      timezone: data.timezone ?? 'Asia/Dubai',
      default_jurisdiction: data.default_jurisdiction ?? null,
      settings: data.settings ?? {},
      brand_color_primary: data.brand_color_primary ?? null,
      brand_color_secondary: data.brand_color_secondary ?? null,
      deactivated_at: data.deactivated_at ?? null,
      deactivation_reason: data.deactivation_reason ?? null,
      onboarding_completed_at: data.onboarding_completed_at ?? null,
      onboarding_metadata: data.onboarding_metadata ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Get the count of documents for a tenant.
   * Uses RLS - documents are in public.documents table with tenant_id column.
   *
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Number of documents
   */
  async getDocumentCount(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    this.tenantLogger.debug(`Getting document count: tenant_id=${tenantId}`);

    const result = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM public.documents WHERE tenant_id = $1`,
      [tenantId],
      options,
    );

    const count = parseInt(result.rows[0]?.count || '0', 10);
    this.tenantLogger.debug(
      `Document count: tenant_id=${tenantId}, count=${count}`,
    );
    return count;
  }
}
