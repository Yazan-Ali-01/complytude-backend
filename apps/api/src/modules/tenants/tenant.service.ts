import { CursorPaginationOptions, CursorPaginationResult } from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { StripeCustomerService } from '../stripe/services/stripe-customer.service';
import { StripeTaxService } from '../stripe/services/stripe-tax.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { DeactivateTenantDto } from './dto/deactivate-tenant.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';

/** Context for tenant operations: platform admin or tenant-scoped with optional permission flags */
// TODO: TenantContext will evolve to support:
// - mode: 'platform' — platform admin operations (bypass RLS)
// - mode: 'purchase' — tenant self-service purchases (new RLS context)
// - mode: 'tenant' — standard tenant operations (current tenant RLS)
// For now, addons use tenant admin context; overrides use platform context.
export type TenantContext =
  | { mode: 'platform' }
  | { mode: 'tenant'; canManageSettings?: boolean; tenantId?: string };

/**
 * Service call options - discriminated union
 * Either provide context (creates transaction) or client (reuses transaction)
 */
export type ServiceCallOptions =
  | { context: TenantContext }
  | { client: PoolClient };

/**
 * Tenant Service
 *
 * Handles all tenant lifecycle operations with Row-Level Security (RLS) support.
 *
 * 🔐 RLS Pattern:
 * - All tenant-scoped reads/writes use `transactionWithTenantContext()` to set `app.current_tenant_id`
 * - This ensures PostgreSQL RLS policies filter data correctly per tenant
 * - Admin operations that bypass RLS should use direct repository calls with explicit client
 *
 * 🔄 Transaction Pattern:
 * - Use `withTenantContext()` helper to wrap operations that need RLS
 * - Pass `{ client }` to repository methods to reuse the same transaction
 * - Avoid nested transactions by checking if client is already provided
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenantRepository: TenantRepository,
    private readonly stripeCustomerService: StripeCustomerService,
    private readonly stripeTaxService: StripeTaxService,
    // private readonly entitlementResolver: EntitlementResolverService,
  ) {}

  // ============================================================================
  // TENANT CREATION & ADMIN OPERATIONS
  // ============================================================================

  /**
   * Create a new tenant
   *
   * 📝 Creates a tenant record with default plan and active status.
   * Does NOT require RLS context since it's inserting a new row (RLS policies typically allow INSERT).
   *
   * @param createTenantDto - Tenant configuration (plan is derived from tenant_subscriptions)
   * @param options - Optional database client for transaction support (used by parent transactions).
   *   `creatorEmail` and `creatorUserId` are forwarded to Stripe customer creation.
   *   TODO: Wire creatorEmail/creatorUserId from the signup flow once tenant creation is
   *   integrated with the auth/signup path.
   * @returns The created Tenant entity with generated ID and timestamps
   *
   * @throws InternalServerErrorException - If database operation fails
   */
  async createTenant(
    createTenantDto: CreateTenantDto,
    options?: {
      client?: PoolClient;
      creatorEmail?: string;
      creatorUserId?: string;
    },
  ): Promise<Tenant> {
    const { client, creatorEmail, creatorUserId } = options ?? {};

    let tenant: Tenant;

    try {
      const tenantCreation = async (client: PoolClient) => {
        return await this.tenantRepository.create(
          {
            is_active: true,
          },
          { client },
        );
      };

      // Reuse provided client or start new transaction
      tenant = client
        ? await tenantCreation(client)
        : await this.databaseService.transaction(tenantCreation);
    } catch (error) {
      this.logger.error(`Failed to create tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to create tenant');
    }

    // Non-fatal: Stripe customer creation must never block tenant signup.
    // Fires and forgets — the returned `tenant` object will have stripe_customer_id = null.
    // Downstream code that needs a guaranteed customer ID should call
    // StripeCustomerService.getOrCreateCustomer() instead of reading tenant.stripe_customer_id directly.
    void this.stripeCustomerService.createCustomerForTenant(
      tenant,
      creatorEmail,
      creatorUserId,
    );

    return tenant;
  }

  /**
   * Get tenant by ID with RLS enforcement
   *
   * 🔐 RLS: Wraps query in tenant context so PostgreSQL policies filter correctly.
   * Returns 404 if tenant doesn't exist OR if caller lacks access per RLS policy.
   *
   * @param tenantId - UUID of the tenant to fetch
   * @returns The Tenant entity if found and accessible
   *
   * @throws NotFoundException - If tenant not found or access denied by RLS
   * @throws InternalServerErrorException - If database operation fails
   *
   * @example
   * ```ts
   * const tenant = await tenantService.findById('111...');
   * ```
   */
  async findById(tenantId: string, context?: TenantContext): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        const tenant =
          await this.databaseService.transactionWithPlatformAdminContext(
            async (client) =>
              this.tenantRepository.findById(tenantId, { client }),
          );
        if (!tenant) {
          throw new NotFoundException(`Tenant ${tenantId} not found`);
        }
        return tenant;
      }
      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      const tenant = await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => this.tenantRepository.findById(tenantId, { client }),
      );
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantId} not found`);
      }
      return tenant;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to fetch tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to fetch tenant');
    }
  }

  /**
   * Get all tenants (admin only when context.mode === 'platform')
   * When platform context, runs in platform admin RLS context so all tenants are visible.
   * Get all tenants (admin-only, bypasses RLS)
   *
   * ⚠️ Admin operation: Does NOT use tenant context. Relies on repository/DB policy
   * to allow system admins to list all tenants. Regular users should not call this.
   *
   * @param cursorOptions - Optional pagination parameters (limit, after, etc.)
   * @returns Paginated list of all tenants in the system
   *
   * @throws InternalServerErrorException - If database operation fails
   *
   * @security Requires system_admin role or equivalent bypass permission
   */
  async findAll(
    cursorOptions?: CursorPaginationOptions,
    context?: TenantContext,
  ): Promise<CursorPaginationResult<Tenant>> {
    try {
      if (context?.mode === 'platform') {
        return this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.findMany({}, cursorOptions, { client }),
        );
      }
      return this.tenantRepository.findMany({}, cursorOptions);
    } catch (error) {
      this.logger.error(`Failed to fetch tenants: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to fetch tenants');
    }
  }

  /**
   * Update tenant properties (admin-only)
   *
   * 🔐 RLS: Validates tenant exists in context before updating.
   * Admins can update any tenant; regular users should use self-management endpoints.
   *
   * @param tenantId - UUID of the tenant to update
   * @param updateTenantDto - Fields to update (partial tenant data)
   * @returns Updated Tenant entity
   *
   * @throws NotFoundException - If tenant not found or access denied
   * @throws InternalServerErrorException - If update fails
   *
   * @security Requires system_admin role
   */
  async updateTenant(
    tenantId: string,
    updateTenantDto: UpdateTenantDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      await this.findById(tenantId, context);

      if (context?.mode === 'platform') {
        return this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(tenantId, updateTenantDto, {
              client,
            }),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          // Validate tenant exists in this context
          const existing = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!existing) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            {
              ...updateTenantDto,
            },
            { client },
          );

          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          return updated;
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to update tenant');
    }
  }

  /**
   * Delete tenant (soft delete or hard delete per policy)
   *
   * 🔐 RLS: Executes in tenant context to ensure caller has delete permission.
   * Typically reserved for system admins or automated cleanup jobs.
   *
   * @param tenantId - UUID of the tenant to delete
   * @returns void (success) or throws error
   *
   * @throws NotFoundException - If tenant not found or access denied
   * @throws InternalServerErrorException - If deletion fails
   *
   * @security Requires system_admin role or equivalent
   * @warning This operation may be irreversible - confirm business logic
   */
  async deleteTenant(tenantId: string, context?: TenantContext): Promise<void> {
    try {
      if (context?.mode === 'platform') {
        await this.databaseService.transactionWithPlatformAdminContext(
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

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          const deleted = await this.tenantRepository.delete(tenantId, {
            client,
          });
          if (deleted === 0) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to delete tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to delete tenant');
    }
  }

  /**
   * Get document count for a tenant (usage tracking)
   *
   * 🔐 RLS: Validates tenant access before counting documents.
   * Used for quota enforcement and billing calculations.
   *
   * @param tenantId - UUID of the tenant
   * @returns Number of documents associated with the tenant
   *
   * @throws InternalServerErrorException - If count query fails
   *
   * @example
   * ```ts
   * const count = await tenantService.getDocumentCount(tenantId);
   * if (count >= quota) { /* block upload *\/ }
   * ```
   */
  async getDocumentCount(tenantId: string): Promise<number> {
    try {
      return await this.databaseService.transactionWithTenantContext(
        { tenantId: tenantId },
        async (client) => {
          // Validate tenant exists first
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return await this.tenantRepository.getDocumentCount(tenantId, {
            client,
          });
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to get document count for tenant ${tenantId}: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve document count',
      );
    }
  }

  // ============================================================================
  // SELF-MANAGEMENT ENDPOINTS (Tenant users managing their own tenant)
  // ============================================================================

  /**
   * Update tenant organization profile
   *
   * 🔐 RLS: Ensures caller can only update their own tenant's profile.
   * Fields: name, contact info, address, business registration details.
   *
   * @param tenantId - UUID of the tenant (validated against auth context)
   * @param dto - Profile fields to update (partial)
   * @returns Updated Tenant entity with new profile data
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @permission Requires 'settings:manage' permission (enforced at controller)
   */
  async updateProfile(
    tenantId: string,
    dto: UpdateTenantProfileDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      let updated: Tenant;

      if (context?.mode === 'platform') {
        updated =
          await this.databaseService.transactionWithPlatformAdminContext(
            async (client) => {
              const tenant = await this.tenantRepository.findById(tenantId, {
                client,
              });
              if (!tenant) {
                throw new NotFoundException(`Tenant ${tenantId} not found`);
              }
              return await this.tenantRepository.update(
                tenantId,
                { ...dto },
                { client },
              );
            },
          );
      } else {
        const canUpdate =
          context?.mode === 'tenant' && context?.canManageSettings;
        updated = await this.databaseService.transactionWithTenantContext(
          { tenantId, isTenantAdmin: !!canUpdate },
          async (client) => {
            const result = await this.tenantRepository.update(
              tenantId,
              { ...dto },
              { client },
            );
            if (!result) {
              throw new NotFoundException(`Tenant ${tenantId} not found`);
            }
            return result;
          },
        );
      }

      this.maybeSyncTaxToStripe(dto, updated);
      return updated;
    } catch (error) {
      // ✅ Map all known exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant profile: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update tenant profile');
    }
  }

  /**
   * Update tenant slug (URL identifier)
   *
   * 🔐 RLS + Uniqueness: Validates tenant access AND checks slug uniqueness across all tenants.
   * Slug changes may affect public URLs - use with caution.
   *
   * @param tenantId - UUID of the tenant
   * @param dto - New slug value (must be URL-safe and unique)
   * @returns Updated Tenant entity with new slug
   *
   * @throws ConflictException - If slug is already taken by another tenant
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @permission Requires 'settings:manage' permission
   * @warning Slug changes may break existing deep links - consider redirect strategy
   */
  async updateSlug(
    tenantId: string,
    dto: UpdateTenantSlugDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) => {
            const isTaken = await this.tenantRepository.isSlugTaken(
              dto.slug,
              tenantId,
              { client },
            );
            if (isTaken) {
              throw new ConflictException(
                `Slug "${dto.slug}" is already taken. Please choose a different slug.`,
              );
            }
            return await this.tenantRepository.update(
              tenantId,
              { slug: dto.slug },
              { client },
            );
          },
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        {
          tenantId,
          isTenantAdmin: !!canUpdate,
          allowCrossTenantRead: !!canUpdate,
        },
        async (client) => {
          // Check slug uniqueness (global, not tenant-scoped)
          const isTaken = await this.tenantRepository.isSlugTaken(
            dto.slug,
            tenantId,
            { client },
          );
          if (isTaken) {
            throw new ConflictException(
              `Slug "${dto.slug}" is already taken. Please choose a different slug.`,
            );
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            { slug: dto.slug },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant slug: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update tenant slug');
    }
  }

  /**
   * Update tenant preferences and settings
   *
   * 🔐 RLS: Deep-merges new settings with existing tenant settings.
   * Fields: locale, timezone, default_jurisdiction, custom settings object.
   *
   * @param tenantId - UUID of the tenant
   * @param dto - Settings to update (partial, deep-merged)
   * @returns Updated Tenant entity with merged settings
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If merge or update fails
   *
   * @permission Requires 'settings:manage' permission
   * @note Settings are deep-merged: `{ theme: 'dark' }` + existing `{ notifications: true }`
   *       = `{ theme: 'dark', notifications: true }`
   */
  async updateSettings(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(tenantId, { ...dto }, { client }),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          // Fetch current tenant to merge settings
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          // Deep-merge settings (shallow merge for top-level fields)
          const mergedSettings = dto.settings
            ? { ...tenant.settings, ...dto.settings }
            : tenant.settings;

          const updated = await this.tenantRepository.update(
            tenantId,
            {
              ...(dto.locale && { locale: dto.locale }),
              ...(dto.timezone && { timezone: dto.timezone }),
              ...(dto.default_jurisdiction !== undefined && {
                default_jurisdiction: dto.default_jurisdiction,
              }),
              settings: mergedSettings,
            },
            { client },
          );

          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant settings: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to update tenant settings',
      );
    }
  }

  /**
   * Update tenant branding colors (white-label feature)
   *
   * 🔐 RLS + Entitlement: Validates tenant access. Entitlement check ('white_label_exports')
   * is enforced at the controller/guard layer, not here.
   *
   * @param tenantId - UUID of the tenant
   * @param dto - Branding fields: brand_color_primary, brand_color_secondary
   * @returns Updated Tenant entity with new branding
   *
   * @throws BadRequestException - If no branding fields provided
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @permission Requires 'settings:manage' + 'white_label_exports' entitlement
   * @note Colors should be valid hex codes (#RRGGBB) - validate at DTO level
   */
  async updateBranding(
    tenantId: string,
    dto: UpdateTenantBrandingDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(tenantId, { ...dto }, { client }),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          if (!dto.brand_color_primary && !dto.brand_color_secondary) {
            throw new BadRequestException(
              'At least one branding field must be provided',
            );
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            { ...dto },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant branding: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to update tenant branding',
      );
    }
  }

  /**
   * Update tenant logo URL (after file upload to storage)
   *
   * 🔐 RLS: Critical for logo upload flow. Called after storageService.uploadFile() succeeds.
   * Updates the logo_url field to point to the uploaded file.
   *
   * @param tenantId - UUID of the tenant
   * @param logoUrl - New logo URL (or null to clear)
   * @returns Updated Tenant entity with new logo_url
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @internal Called by TenantController.uploadLogo() after successful file upload
   * @note Does NOT handle file upload/deletion - that's StorageService responsibility
   */
  async updateLogoUrl(
    tenantId: string,
    logoUrl: string | null,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(
              tenantId,
              { logo_url: logoUrl },
              { client },
            ),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          const updated = await this.tenantRepository.update(
            tenantId,
            { logo_url: logoUrl },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant logo: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update tenant logo');
    }
  }

  /**
   * Mark tenant onboarding as complete
   *
   * 🔐 RLS: Idempotent operation - safe to call multiple times.
   * Sets onboarding_completed_at timestamp for analytics and UI flow control.
   *
   * @param tenantId - UUID of the tenant
   * @returns Tenant entity (unchanged if already completed)
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @permission Requires 'settings:manage' permission
   * @note Idempotent: returns immediately if onboarding_completed_at is already set
   */
  async completeOnboarding(
    tenantId: string,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(
              tenantId,
              { onboarding_completed_at: new Date() },
              { client },
            ),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          // Idempotent: skip if already completed
          if (tenant.onboarding_completed_at) {
            return tenant;
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            { onboarding_completed_at: new Date() },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to complete onboarding: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to complete onboarding');
    }
  }

  /**
   * Update onboarding progress metadata
   *
   * 🔐 RLS: Deep-merges onboarding_metadata to track step completion.
   * Used for progressive onboarding UI and analytics.
   *
   * @param tenantId - UUID of the tenant
   * @param dto - Onboarding metadata to merge (partial)
   * @returns Updated Tenant entity with merged onboarding_metadata
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If merge or update fails
   *
   * @permission Requires 'settings:manage' permission
   * @note Metadata is deep-merged: new fields added, existing fields preserved unless overwritten
   */
  async updateOnboarding(
    tenantId: string,
    dto: UpdateOnboardingDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          async (client) =>
            this.tenantRepository.update(
              tenantId,
              { onboarding_metadata: dto.onboarding_metadata },
              { client },
            ),
        );
      }

      const canUpdate =
        context?.mode === 'tenant' && context?.canManageSettings;
      return await this.databaseService.transactionWithTenantContext(
        { tenantId, isTenantAdmin: !!canUpdate },
        async (client) => {
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          // Deep-merge onboarding metadata
          const mergedMetadata = {
            ...tenant.onboarding_metadata,
            ...dto.onboarding_metadata,
          };

          const updated = await this.tenantRepository.update(
            tenantId,
            { onboarding_metadata: mergedMetadata },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`Failed to update onboarding: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to update onboarding');
    }
  }

  // ============================================================================
  // ADMIN LIFECYCLE MANAGEMENT (System admin operations)
  // ============================================================================

  /**
   * Deactivate a tenant (suspend access)
   *
   * 🔐 RLS: Admin operation that still respects tenant context for audit/logging.
   * Sets is_active=false and records deactivation reason/timestamp.
   *
   * @param tenantId - UUID of the tenant to deactivate
   * @param dto - Deactivation reason (required for audit trail)
   * @returns Updated Tenant entity with deactivated status
   *
   * @throws BadRequestException - If tenant already deactivated
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @security Requires system_admin role
   * @audit Logs deactivation reason and timestamp for compliance
   */
  async deactivateTenant(
    tenantId: string,
    dto: DeactivateTenantDto,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode !== 'platform') {
        throw new ForbiddenException(
          'Only platform administrators can deactivate tenants',
        );
      }
      return await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          if (!tenant.is_active) {
            throw new BadRequestException(
              `Tenant ${tenantId} is already deactivated`,
            );
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            {
              is_active: false,
              deactivated_at: new Date(),
              deactivation_reason: dto.reason,
            },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          this.logger.warn(
            `Tenant ${tenantId} deactivated by admin. Reason: ${dto.reason}`,
          );
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`Failed to deactivate tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to deactivate tenant');
    }
  }

  /**
   * Reactivate a previously deactivated tenant
   *
   * 🔐 RLS: Admin operation with audit logging.
   * Restores is_active=true and clears deactivation fields.
   *
   * @param tenantId - UUID of the tenant to reactivate
   * @returns Updated Tenant entity with active status
   *
   * @throws BadRequestException - If tenant already active
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @security Requires system_admin role
   * @audit Logs reactivation event for compliance tracking
   */
  async reactivateTenant(
    tenantId: string,
    context?: TenantContext,
  ): Promise<Tenant> {
    try {
      if (context?.mode !== 'platform') {
        throw new ForbiddenException(
          'Only platform administrators can reactivate tenants',
        );
      }
      return await this.databaseService.transactionWithPlatformAdminContext(
        async (client) => {
          const tenant = await this.tenantRepository.findById(tenantId, {
            client,
          });
          if (!tenant) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          if (tenant.is_active) {
            throw new BadRequestException(
              `Tenant ${tenantId} is already active`,
            );
          }

          const updated = await this.tenantRepository.update(
            tenantId,
            {
              is_active: true,
              deactivated_at: null,
              deactivation_reason: null,
            },
            { client },
          );
          if (!updated) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }

          this.logger.log(`Tenant ${tenantId} reactivated by admin`);
          return updated;
        },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`Failed to reactivate tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to reactivate tenant');
    }
  }

  /**
   * Admin update tenant profile (bypasses some user permissions)
   *
   * 🔐 RLS: Admin operation that can update any tenant's profile.
   * Similar to updateProfile() but available to system admins for support tasks.
   *
   * @param tenantId - UUID of the tenant to update
   * @param dto - Profile fields to update (partial)
   * @returns Updated Tenant entity
   *
   * @throws NotFoundException - If tenant not found
   * @throws InternalServerErrorException - If update fails
   *
   * @security Requires system_admin role
   * @note Use for support/admin tasks - regular users should use /me/profile endpoint
   */
  async adminUpdateProfile(
    tenantId: string,
    dto: UpdateTenantProfileDto,
  ): Promise<Tenant> {
    try {
      const updated = await this.databaseService.transactionWithTenantContext(
        { tenantId: tenantId },
        async (client) => {
          const result = await this.tenantRepository.update(
            tenantId,
            { ...dto },
            { client },
          );
          if (!result) {
            throw new NotFoundException(`Tenant ${tenantId} not found`);
          }
          return result;
        },
      );

      this.maybeSyncTaxToStripe(dto, updated);
      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `[ADMIN] Failed to update tenant profile: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update tenant profile');
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget tax sync: if the DTO touches any Stripe Tax–relevant field
   * (address, TRN, or name) and the tenant already has a Stripe customer, kick
   * off a non-blocking sync. Errors are handled inside StripeTaxService.
   */
  private maybeSyncTaxToStripe(
    dto: UpdateTenantProfileDto,
    tenant: Tenant,
  ): void {
    if (!tenant.stripe_customer_id) return;

    const taxRelevantFields: (keyof UpdateTenantProfileDto)[] = [
      'name',
      'emirate',
      'city',
      'address_line_1',
      'address_line_2',
      'postal_code',
      'tax_registration_number',
    ];

    const hasTaxRelevantChange = taxRelevantFields.some(
      (field) => field in dto && dto[field] !== undefined,
    );

    if (hasTaxRelevantChange) {
      void this.stripeTaxService.syncCustomerTax(
        tenant.stripe_customer_id,
        tenant,
      );
    }
  }
}
