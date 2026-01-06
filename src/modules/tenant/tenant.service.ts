import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { FeaturesService } from './features.service';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly featuresService: FeaturesService,
  ) {}

  /**
   * Initialize the multi-tenancy infrastructure
   * Creates the main tenants table and RLS policies (Pure RLS approach)
   */
  async initializeMultiTenancy(): Promise<void> {
    try {
      await this.databaseService.transaction(async (client) => {
        // Create tenants table (Pure RLS - no schema_name column)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.tenants (
            id VARCHAR(255) PRIMARY KEY,
            tenant_id VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
            plan VARCHAR(50) NOT NULL CHECK (plan IN ('early_access', 'basic', 'pro', 'enterprise')),
            features JSONB NOT NULL DEFAULT '{}',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON public.tenants(tenant_id);
          CREATE INDEX IF NOT EXISTS idx_tenants_email ON public.tenants(email);
          CREATE INDEX IF NOT EXISTS idx_tenants_plan ON public.tenants(plan);
          CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants(is_active);
        `);

        // Enable Row Level Security on tenants table
        await client.query(`
          ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
        `);

        // Create RLS policy for tenants - users can only see their own tenant
        await client.query(`
          DROP POLICY IF EXISTS tenant_isolation_policy ON public.tenants;
          CREATE POLICY tenant_isolation_policy ON public.tenants
            FOR ALL
            USING (
              tenant_id = current_setting('app.current_tenant_id', true)
              OR current_setting('app.bypass_rls', true) = 'true'
            );
        `);
      });
    } catch (error) {
      this.logger.error('Failed to initialize multi-tenancy', error);
      throw new InternalServerErrorException(
        'Failed to initialize multi-tenancy',
      );
    }
  }

  /**
   * Create a new tenant (Pure RLS - no schema creation)
   */
  async createTenant(
    createTenantDto: CreateTenantDto,
    userId: string = `user_${randomUUID()}`,
  ): Promise<Tenant> {
    const tenantId = `tenant_${randomUUID()}`;

    try {
      // Check if email already exists
      const existingTenant = await this.databaseService.query(
        'SELECT id FROM public.tenants WHERE email = $1',
        [createTenantDto.email],
      );

      if (existingTenant.rows.length > 0) {
        throw new ConflictException('Email already registered');
      }

      return await this.databaseService.transaction(async (client) => {
        // Create tenant record (no schema_name column)
        const tenantResult = await client.query<Tenant>(
          `
          INSERT INTO public.tenants (id, tenant_id, email, role, plan, features, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          RETURNING *
        `,
          [
            userId,
            tenantId,
            createTenantDto.email,
            createTenantDto.role,
            createTenantDto.plan,
            JSON.stringify(createTenantDto.features),
          ],
        );

        const tenant = tenantResult.rows[0];

        // Parse features back to object
        tenant.features =
          typeof tenant.features === 'string'
            ? JSON.parse(tenant.features)
            : tenant.features;

        return tenant;
      });
    } catch (error) {
      this.logger.error(`Failed to create tenant: ${error.message}`, error);
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create tenant');
    }
  }

  /**
   * Get tenant by ID
   */
  async findById(tenantId: string): Promise<Tenant> {
    try {
      const result = await this.databaseService.query<Tenant>(
        'SELECT * FROM public.tenants WHERE tenant_id = $1',
        [tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      const tenant = result.rows[0];
      tenant.features =
        typeof tenant.features === 'string'
          ? JSON.parse(tenant.features)
          : tenant.features;

      return tenant;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch tenant');
    }
  }

  /**
   * Get tenant by email
   */
  async findByEmail(email: string): Promise<Tenant> {
    try {
      const result = await this.databaseService.query<Tenant>(
        'SELECT * FROM public.tenants WHERE email = $1',
        [email],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tenant with email ${email} not found`);
      }

      const tenant = result.rows[0];
      tenant.features =
        typeof tenant.features === 'string'
          ? JSON.parse(tenant.features)
          : tenant.features;

      return tenant;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch tenant');
    }
  }

  /**
   * Get all tenants (admin only)
   */
  async findAll(): Promise<Tenant[]> {
    try {
      const result = await this.databaseService.query<Tenant>(
        'SELECT * FROM public.tenants ORDER BY created_at DESC',
      );

      return result.rows.map((tenant) => ({
        ...tenant,
        features:
          typeof tenant.features === 'string'
            ? JSON.parse(tenant.features)
            : tenant.features,
      }));
    } catch {
      throw new InternalServerErrorException('Failed to fetch tenants');
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(
    tenantId: string,
    updateTenantDto: UpdateTenantDto,
  ): Promise<Tenant> {
    try {
      await this.findById(tenantId);

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateTenantDto.email) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(updateTenantDto.email);
      }
      if (updateTenantDto.role) {
        updateFields.push(`role = $${paramIndex++}`);
        values.push(updateTenantDto.role);
      }
      if (updateTenantDto.plan) {
        updateFields.push(`plan = $${paramIndex++}`);
        values.push(updateTenantDto.plan);
      }
      if (updateTenantDto.features) {
        updateFields.push(`features = $${paramIndex++}`);
        values.push(JSON.stringify(updateTenantDto.features));
      }
      if (updateTenantDto.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        values.push(updateTenantDto.is_active);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(tenantId);

      const query = `
        UPDATE public.tenants 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.databaseService.query<Tenant>(query, values);

      const updatedTenant = result.rows[0];
      updatedTenant.features =
        typeof updatedTenant.features === 'string'
          ? JSON.parse(updatedTenant.features)
          : updatedTenant.features;

      return updatedTenant;
    } catch (error) {
      this.logger.error(`Failed to update tenant: ${error.message}`);
      throw new InternalServerErrorException('Failed to update tenant');
    }
  }

  /**
   * Delete tenant (Pure RLS - data automatically deleted via CASCADE)
   */
  async deleteTenant(tenantId: string): Promise<void> {
    try {
      // Verify tenant exists
      await this.findById(tenantId);

      // Delete tenant record (CASCADE will delete related data via foreign keys)
      await this.databaseService.query(
        'DELETE FROM public.tenants WHERE tenant_id = $1',
        [tenantId],
      );

      this.logger.log(`Tenant ${tenantId} deleted successfully`);
    } catch (error) {
      this.logger.error(`Failed to delete tenant: ${error.message}`);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete tenant');
    }
  }

  /**
   * Set tenant context for RLS
   */
  async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  }

  /**
   * Get document count for a tenant (Pure RLS approach)
   * Counts documents from public.documents table filtered by tenant_id via RLS
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      // Verify tenant exists
      await this.findById(tenantId);

      // Count documents in public.documents table with tenant_id filter
      // Note: RLS will automatically filter by tenant context if set
      const result = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM public.documents WHERE tenant_id = $1`,
        [tenantId],
      );

      const count = parseInt(String(result.rows[0].count), 10);
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to get document count for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve document count',
      );
    }
  }

  /**
   * Check if tenant can upload more documents based on their plan limit
   */
  async canUploadDocument(tenantId: string): Promise<{
    allowed: boolean;
    limit: number;
    current: number;
    message?: string;
  }> {
    try {
      // Get current document count
      const currentCount = await this.getDocumentCount(tenantId);

      // Use FeaturesService to get the correct document limit (merges plan defaults with custom features)
      const result = await this.featuresService.checkDocumentLimit(
        tenantId,
        currentCount,
      );

      // Add descriptive message
      const message = result.allowed
        ? result.limit === -1
          ? 'Unlimited documents'
          : `${result.current}/${result.limit} documents used`
        : `Document limit reached (${result.limit}). Please upgrade your plan.`;

      return {
        ...result,
        message,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check document upload permission for tenant ${tenantId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to check document upload permission',
      );
    }
  }
}
