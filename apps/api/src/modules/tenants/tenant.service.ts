import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import {
  CursorPaginationOptions,
  CursorPaginationResult,
} from 'src/repositories/base/repository.interface';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly entitlementResolver: EntitlementResolverService,
  ) {}

  /**
   * Create a new tenant
   * @param createTenantDto - Tenant configuration (plan)
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

    try {
      const tenantCreation = async (client: PoolClient) => {
        const tenant = await this.tenantRepository.create(
          {
            plan: createTenantDto.plan ?? 'navigator',
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
}
