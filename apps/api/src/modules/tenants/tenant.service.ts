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
  async findById(
    tenantId: string,
    options?: { platformAdminContext?: string },
  ): Promise<Tenant> {
    try {
      if (options?.platformAdminContext) {
        const tenant = await this.databaseService.transactionWithPlatformAdminContext(
          options.platformAdminContext,
          async (client) =>
            this.tenantRepository.findById(tenantId, { client }),
        );
        if (!tenant) {
          throw new NotFoundException(`Tenant ${tenantId} not found`);
        }
        return tenant;
      }
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
   * Get all tenants (admin only when platformAdminContext)
   * When platformAdminContext is true, runs in platform admin RLS context so all tenants are visible.
   */
  async findAll(
    cursorOptions?: CursorPaginationOptions,
    options?: { platformAdminContext?: string },
  ): Promise<CursorPaginationResult<Tenant>> {
    try {
      if (options?.platformAdminContext) {
        return this.databaseService.transactionWithPlatformAdminContext(
          options.platformAdminContext,
          async (client) => {
            return this.tenantRepository.findMany({}, cursorOptions, {
              client,
            });
          },
        );
      }
      return this.tenantRepository.findMany({}, cursorOptions);
    } catch (error) {
      this.logger.error(`Failed to fetch tenants: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to fetch tenants');
    }
  }

  /**
   * Update tenant
   * When platformAdminContext is set, runs in platform admin RLS context.
   */
  async updateTenant(
    tenantId: string,
    updateTenantDto: UpdateTenantDto,
    options?: { platformAdminContext?: string },
  ): Promise<Tenant> {
    try {
      await this.findById(tenantId, options);

      if (options?.platformAdminContext) {
        return this.databaseService.transactionWithPlatformAdminContext(
          options.platformAdminContext,
          async (client) =>
            this.tenantRepository.update(tenantId, updateTenantDto, {
              client,
            }) as Promise<Tenant>,
        );
      }

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
   * When platformAdminContext is set, runs in platform admin RLS context.
   */
  async deleteTenant(
    tenantId: string,
    options?: { platformAdminContext?: string },
  ): Promise<void> {
    try {
      if (options?.platformAdminContext) {
        await this.databaseService.transactionWithPlatformAdminContext(
          options.platformAdminContext,
          async (client) => {
            const deleted = await this.tenantRepository.delete(tenantId, {
              client,
            });
            if (deleted === 0) {
              throw new NotFoundException(`Tenant ${tenantId} not found`);
            }
          },
        );
        return;
      }

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
