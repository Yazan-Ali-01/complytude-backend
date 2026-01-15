import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import {
  CursorPaginationOptions,
  CursorPaginationResult,
} from 'src/repositories/base/repository.interface';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant, TenantFeatures } from './entities/tenant.entity';
import { FeaturesService } from './features.service';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly featuresService: FeaturesService,
  ) {}

  /**
   * Create a new tenant
   */
  async createTenant(
    createTenantDto: CreateTenantDto,
    options?: {
      client?: PoolClient;
    },
  ): Promise<Tenant> {
    const { client } = options ?? {};
    const tenantId = `tenant_${randomUUID()}`;
    const features: TenantFeatures = { ...createTenantDto.features };

    try {
      const existingTenant = await this.tenantRepository.findOne({
        filters: {
          email: createTenantDto.email,
        },
        select: ['id'],
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
            features: JSON.stringify(features),
            is_active: true,
          },
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
        select: [
          'id',
          'tenant_id',
          'email',
          'role',
          'plan',
          'features',
          'is_active',
          'created_at',
          'updated_at',
        ],
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
        select: [
          'id',
          'tenant_id',
          'email',
          'role',
          'plan',
          'features',
          'is_active',
          'created_at',
          'updated_at',
        ],
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
  async findAll(
    cursorOptions?: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<Tenant>> {
    try {
      const tenants = await this.tenantRepository.findMany({}, cursorOptions);
      return tenants;
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

      const updated = await this.tenantRepository.updateByTenantId(tenantId, {
        ...updateTenantDto,
        features:
          updateTenantDto.features === undefined
            ? JSON.stringify(updateTenantDto.features)
            : undefined,
      });

      if (!updated) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }

      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update tenant: ${error.message}`);
      throw new InternalServerErrorException('Failed to update tenant');
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(tenantId: string): Promise<void> {
    try {
      await this.databaseService.transaction(async (client) => {
        const deleted = await this.tenantRepository.deleteByTenantId(tenantId, {
          client,
        });

        if (deleted === 0) {
          throw new NotFoundException(`Tenant ${tenantId} not found`);
        }
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete tenant: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete tenant');
    }
  }

  /**
   * Get document count for a tenant
   * Assumes documents are stored in a 'documents' table in the tenant's schema
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      const tenant = await this.findById(tenantId);

      return await this.tenantRepository.getDocumentCount(tenant.tenant_id);
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
