import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService, CursorPaginationOptions, CursorPaginationResult, TenantRepository } from '@complytude/shared';
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
   * @param createTenantDto - Tenant configuration (plan, features)
   * @param options - Optional database client for transaction support
   * @returns Created Tenant entity
   */
  async createTenant(
    createTenantDto: CreateTenantDto,
    options?: {
      client?: PoolClient;
    },
  ): Promise<Tenant> {
    const { client } = options ?? {};
    const features: TenantFeatures = { ...createTenantDto.features };

    try {
      const tenantCreation = async (client: PoolClient) => {
        const tenant = await this.tenantRepository.create(
          {
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
      throw new InternalServerErrorException('Failed to create tenant');
    }
  }

  /**
   * Get tenant by ID
   */
  async findById(tenantId: string): Promise<Tenant> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);

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

      const updated = await this.tenantRepository.update(tenantId, {
        ...updateTenantDto,
        features:
          updateTenantDto.features !== undefined
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
        const deleted = await this.tenantRepository.delete(tenantId, {
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
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      await this.findById(tenantId); // Ensure tenant exists

      return await this.tenantRepository.getDocumentCount(tenantId);
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
