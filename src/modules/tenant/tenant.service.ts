import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FeaturesService } from './features.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant, TenantSchema } from './entities/tenant.entity';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly featuresService: FeaturesService,
  ) {}

  /**
   * Initialize the multi-tenancy infrastructure
   * Creates the main tenants table and RLS policies
   */
  async initializeMultiTenancy(): Promise<void> {
    this.logger.log('Initializing multi-tenancy infrastructure...');

    try {
      await this.databaseService.transaction(async (client) => {
        // Create tenants table
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.tenants (
            id VARCHAR(255) PRIMARY KEY,
            tenant_id VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
            plan VARCHAR(50) NOT NULL CHECK (plan IN ('navigator', 'shield', 'general_counsel', 'infrastructure')),
            features JSONB NOT NULL DEFAULT '{}',
            schema_name VARCHAR(255) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create tenant schemas table
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.tenant_schemas (
            tenant_id VARCHAR(255) PRIMARY KEY REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
            schema_name VARCHAR(255) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON public.tenants(tenant_id);
          CREATE INDEX IF NOT EXISTS idx_tenants_email ON public.tenants(email);
          CREATE INDEX IF NOT EXISTS idx_tenant_schemas_tenant_id ON public.tenant_schemas(tenant_id);
        `);

        // Enable Row Level Security on tenants table
        await client.query(`
          ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
        `);

        // Create RLS policy for tenants - users can only see their own tenant
        await client.query(`
          DROP POLICY IF EXISTS tenant_isolation_policy ON public.tenants;
          CREATE POLICY tenant_isolation_policy ON public.tenants
            USING (tenant_id = current_setting('app.current_tenant_id', true));
        `);

        this.logger.log('✅ Multi-tenancy infrastructure initialized');
      });
    } catch (error) {
      this.logger.error('Failed to initialize multi-tenancy', error);
      throw new InternalServerErrorException(
        'Failed to initialize multi-tenancy',
      );
    }
  }

  /**
   * Create a new tenant with isolated schema
   */
  async createTenant(createTenantDto: CreateTenantDto): Promise<Tenant> {
    const tenantId = `tenant_${randomUUID()}`;
    const userId = `user_${randomUUID()}`;
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;

    this.logger.log(`Creating tenant ${tenantId} with schema ${schemaName}`);

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
        // Create tenant record
        const tenantResult = await client.query<Tenant>(
          `
          INSERT INTO public.tenants (id, tenant_id, email, role, plan, features, schema_name, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, true)
          RETURNING *
        `,
          [
            userId,
            tenantId,
            createTenantDto.email,
            createTenantDto.role,
            createTenantDto.plan,
            JSON.stringify(createTenantDto.features),
            schemaName,
          ],
        );

        const tenant = tenantResult.rows[0];

        // Create schema record
        await client.query(
          `
          INSERT INTO public.tenant_schemas (tenant_id, schema_name, is_active)
          VALUES ($1, $2, true)
        `,
          [tenantId, schemaName],
        );

        // Create the actual database schema
        await this.createTenantSchema(client, schemaName);

        // Initialize schema with base tables
        await this.initializeTenantSchema(client, schemaName, tenantId);

        this.logger.log(`✅ Tenant ${tenantId} created successfully`);

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
   * Create a database schema for a tenant
   */
  private async createTenantSchema(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schemaName} TO CURRENT_USER`);
    await client.query(`GRANT CREATE ON SCHEMA ${schemaName} TO CURRENT_USER`);
    this.logger.log(`Schema ${schemaName} created`);
  }

  /**
   * Initialize tenant schema with base tables and RLS
   */
  private async initializeTenantSchema(
    client: PoolClient,
    schemaName: string,
    _tenantId: string,
  ): Promise<void> {
    // Example: Create a documents table with RLS
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.documents (
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
    `);

    // Enable RLS on tenant tables
    await client.query(`
      ALTER TABLE ${schemaName}.documents ENABLE ROW LEVEL SECURITY;
    `);

    // Create RLS policy - documents are isolated by tenant_id
    await client.query(`
      CREATE POLICY documents_tenant_isolation ON ${schemaName}.documents
        USING (tenant_id = current_setting('app.current_tenant_id', true));
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON ${schemaName}.documents(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_documents_template_key ON ${schemaName}.documents(template_key);
    `);

    this.logger.log(
      `Schema ${schemaName} initialized with base tables and RLS`,
    );
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
      // 🔍 DEBUG: Log the update request
      this.logger.log(`🔍 [DEBUG] Updating tenant ${tenantId} with:`, {
        updateTenantDto: updateTenantDto,
        plan: updateTenantDto.plan,
        features: updateTenantDto.features,
      });

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
        this.logger.log(
          `🔍 [DEBUG] Will update plan to: ${updateTenantDto.plan}`,
        );
      }
      if (updateTenantDto.features) {
        updateFields.push(`features = $${paramIndex++}`);
        values.push(JSON.stringify(updateTenantDto.features));
        this.logger.log(
          `🔍 [DEBUG] Will update features to:`,
          updateTenantDto.features,
        );
      } else {
        this.logger.log(
          `🔍 [DEBUG] No features provided - will keep existing features`,
        );
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

      // 🔍 DEBUG: Log the SQL query
      this.logger.log(`🔍 [DEBUG] Executing SQL:`, {
        query: query,
        values: values,
      });

      const result = await this.databaseService.query<Tenant>(query, values);

      const updatedTenant = result.rows[0];
      updatedTenant.features =
        typeof updatedTenant.features === 'string'
          ? JSON.parse(updatedTenant.features)
          : updatedTenant.features;

      // 🔍 DEBUG: Log the result
      this.logger.log(`🔍 [DEBUG] Tenant update result:`, {
        plan: updatedTenant.plan,
        features: updatedTenant.features,
        featuresType: typeof updatedTenant.features,
      });

      this.logger.log(`Tenant ${tenantId} updated successfully`);
      return updatedTenant;
    } catch (error) {
      this.logger.error(`Failed to update tenant: ${error.message}`);
      throw new InternalServerErrorException('Failed to update tenant');
    }
  }

  /**
   * Delete tenant and its schema
   */
  async deleteTenant(tenantId: string): Promise<void> {
    try {
      const tenant = await this.findById(tenantId);

      await this.databaseService.transaction(async (client) => {
        // Drop the schema
        await client.query(
          `DROP SCHEMA IF EXISTS ${tenant.schema_name} CASCADE`,
        );

        // Delete tenant record
        await client.query('DELETE FROM public.tenants WHERE tenant_id = $1', [
          tenantId,
        ]);

        this.logger.log(
          `Tenant ${tenantId} and schema ${tenant.schema_name} deleted`,
        );
      });
    } catch (error) {
      this.logger.error(`Failed to delete tenant: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete tenant');
    }
  }

  /**
   * Get tenant schema information
   */
  async getTenantSchema(tenantId: string): Promise<TenantSchema> {
    try {
      const result = await this.databaseService.query<TenantSchema>(
        'SELECT * FROM public.tenant_schemas WHERE tenant_id = $1',
        [tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Schema for tenant ${tenantId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch tenant schema');
    }
  }

  /**
   * Set tenant context for RLS
   */
  async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  }

  /**
   * Get document count for a tenant
   * Assumes documents are stored in a 'documents' table in the tenant's schema
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      // Get tenant's schema name
      const tenant = await this.findById(tenantId);
      const schemaName = tenant.schema_name;

      // Check if documents table exists in tenant schema
      const tableExists = await this.databaseService.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 
          AND table_name = 'documents'
        )`,
        [schemaName],
      );

      if (!tableExists.rows[0].exists) {
        this.logger.debug(
          `Documents table does not exist in schema ${schemaName}, returning count 0`,
        );
        return 0;
      }

      // Count documents in tenant schema
      const result = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".documents`,
      );

      const count = parseInt(String(result.rows[0].count), 10);
      this.logger.debug(`Tenant ${tenantId} has ${count} documents`);

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
