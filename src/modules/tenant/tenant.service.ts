import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { FeaturesService } from './features.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant, TenantFeatures, TenantSchema } from './entities/tenant.entity';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly featuresService: FeaturesService,
  ) {}

  /**
   * Initialize the multi-tenancy infrastructure
   * Creates the main tenants table and RLS policies
   */
  async initializeMultiTenancy(): Promise<void> {
    try {
      await this.databaseService.transaction(async (client) => {
        await this.tenantRepository.initializeInfrastructure({ client });
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
  async createTenant(
    createTenantDto: CreateTenantDto,
    options?: {
      client?: PoolClient;
    },
  ): Promise<Tenant> {
    const { client } = options ?? {};
    const tenantId = `tenant_${randomUUID()}`;
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    const features: TenantFeatures = { ...createTenantDto.features };

    try {
      const existingTenant = await this.tenantRepository.findOne({
        filters: {
          email: createTenantDto.email,
        },
      });

      if (existingTenant) {
        throw new ConflictException('Email already registered');
      }
      const tenantCreation = async (client) => {
        const tenant = await this.tenantRepository.create(
          {
            id: createTenantDto.userId ?? `tenant_${randomUUID()}`,
            tenant_id: tenantId,
            email: createTenantDto.email,
            role: createTenantDto.role,
            plan: createTenantDto.plan,
            features: features,
            schema_name: schemaName,
            is_active: true,
          },
          { client },
        );

        await this.tenantRepository.createTenantSchemaRecord(
          tenantId,
          schemaName,
          { client },
        );

        await this.tenantRepository.createTenantSchema(schemaName, { client });
        await this.tenantRepository.initializeTenantSchema(
          schemaName,
          tenantId,
          { client },
        );

        return tenant;
      };
      if (client) {
        return await tenantCreation(client);
      } else {
        return await this.databaseService.transaction(tenantCreation);
      }
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
      const tenant = await this.tenantRepository.findOne({
        filters: {
          tenant_id: tenantId,
        },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

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
      const tenant = await this.tenantRepository.findOne({
        filters: {
          email,
        },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant with email ${email} not found`);
      }

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
      const tenants = await this.tenantRepository.findAll();
      return tenants.data.map((tenant) => ({
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

      return await this.tenantRepository.updateByTenantId(
        tenantId,
        updateTenantDto,
      );
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
        await this.tenantRepository.dropTenantSchema(tenant.schema_name, {
          client,
        });

        await this.tenantRepository.deleteByTenantId(tenantId, { client });
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
      const schema = await this.tenantRepository.getTenantSchema(tenantId);

      if (!schema) {
        throw new NotFoundException(`Schema for tenant ${tenantId} not found`);
      }

      return schema;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to fetch tenant schema');
    }
  }

  /**
   * Get document count for a tenant
   * Assumes documents are stored in a 'documents' table in the tenant's schema
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      const tenant = await this.findById(tenantId);

      return await this.tenantRepository.getDocumentCount(tenant.schema_name);
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
