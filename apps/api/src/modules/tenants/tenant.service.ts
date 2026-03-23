import {
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
} from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { SystemTenantRole } from '../../common/types/tenant.types';
import { deepMerge } from '../../common/utils/deep-merge.util';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import {
  QueueProducerService,
  QUEUE_NAMES,
  TENANT_JOB_NAMES,
} from '@lib/queue';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsI18n } from './constants/i18n.constants';
import {
  DEFAULT_ONBOARDING_METADATA,
  type StepsCompleted,
} from './constants/onboarding.constants';
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
  | { mode: 'tenant'; tenantId?: string };

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
    private readonly queueProducer: QueueProducerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly i18n: I18nService,
  ) {}

  // ============================================================================
  // TENANT CREATION & ADMIN OPERATIONS
  // ============================================================================

  /**
   * Execute database operation with appropriate RLS context
   *
   * 🎯 Purpose: Centralized context handling to eliminate duplication across all methods
   *
   * Handles two execution modes:
   * - Platform admin: Bypasses RLS, sees all tenants
   * - Tenant scope: Enforces RLS, filtered by tenant + permissions
   *
   * @param tenantId - Tenant ID for RLS context (ignored in platform mode)
   * @param context - Optional execution context (platform vs tenant)
   * @param callback - Database operation to execute within transaction
   * @param options - Additional context options
   * @returns Result from callback execution
   *
   * @throws Re-throws known exceptions (NotFound, Forbidden, BadRequest, Conflict)
   * @throws InternalServerErrorException for unexpected errors
   *
   * @example
   * ```ts
   * return this.executeInTenantScope(tenantId, context, async (client) => {
   *   return this.tenantRepository.findById(tenantId, { client });
   * });
   * ```
   */

  private async executeInTenantScope<T>(
    tenantId: string,
    context: TenantContext | undefined,
    callback: (client: PoolClient) => Promise<T>,
    options?: {
      allowCrossTenantRead?: boolean;
    },
  ): Promise<T> {
    try {
      // Platform admin mode: bypass RLS, full system access
      if (context?.mode === 'platform') {
        return await this.databaseService.transactionWithPlatformAdminContext(
          callback,
        );
      }

      // Tenant mode: enforce RLS with tenant context
      return await this.databaseService.transactionWithTenantContext(
        {
          tenantId,
          isTenantAdmin: true,
          allowCrossTenantRead: options?.allowCrossTenantRead,
        },
        callback,
      );
    } catch (error) {
      // Pass through known business logic exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Log and wrap unexpected errors
      this.logger.error(
        `Database operation failed: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        this.i18n.t(TenantsI18n.errors.TENANT_CREATION_FAILED),
      );
    }
  }

  /**
   * Update tenant and throw NotFoundException if not found.
   * Centralizes the repeated update + null-check pattern.
   */
  private async updateOrThrow(
    tenantId: string,
    data: UpdateTenantDto | Record<string, unknown>,
    client: PoolClient,
  ): Promise<Tenant> {
    const updated = await this.tenantRepository.update(tenantId, data, {
      client,
    });
    if (!updated) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    return updated;
  }

  /**
   * Create a new tenant with default subscription
   *
   * 📝 Creates a tenant record with default plan and active status.
   * Also creates a default subscription in the same transaction for atomicity.
   * Does NOT require RLS context since it's inserting new rows (RLS policies typically allow INSERT).
   *
   * @param createTenantDto - Tenant creation data (optional planKey, defaults to 'navigator')
   * @param subscriptionCreatorUserId - User ID for subscription creator (null when created by system)
   * @param options - Optional client for transaction reuse
   * @returns The created Tenant entity with generated ID and timestamps
   *
   * @throws InternalServerErrorException - If database operation fails
   * @throws NotFoundException - If specified plan not found
   * @throws BadRequestException - If specified plan is not active
   *
   * @example
   * ```ts
   * const tenant = await tenantService.createTenant({ name: 'Acme', planKey: 'general_counsel' }, userId);
   * const tenant = await tenantService.createTenant(dto, null, { client }); // Reuse parent transaction
   * ```
   */
  async createTenant(
    createTenantDto: CreateTenantDto,
    subscriptionCreatorUserId: string | null,
    options?: {
      client?: PoolClient;
    },
  ): Promise<Tenant> {
    const { client } = options ?? {};

    let tenant: Tenant;

    try {
      const tenantCreation = async (txClient: PoolClient) => {
        const created = await this.tenantRepository.create(
          {
            name: createTenantDto.name,
            is_active: true,
            onboarding_metadata: { ...DEFAULT_ONBOARDING_METADATA },
          },
          { client: txClient },
        );

        if (createTenantDto.planKey) {
          await this.subscriptionsService.createSubscription(
            created.id,
            createTenantDto.planKey,
            subscriptionCreatorUserId ?? null,
            { client: txClient },
          );
          this.logger.log(
            `Tenant created with subscription: tenant=${created.id}, plan=${createTenantDto.planKey}`,
          );
        } else {
          await this.subscriptionsService.createTrialSubscription(
            created.id,
            subscriptionCreatorUserId ?? null,
            { client: txClient },
          );
          this.logger.log(
            `Tenant created with trial subscription: tenant=${created.id}`,
          );
        }

        return created;
      };

      if (client) {
        tenant = await tenantCreation(client);
      } else {
        tenant =
          await this.databaseService.transactionWithPlatformAdminContext(
            tenantCreation,
          );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      // Unique violation (23505) = duplicate tenant name (race condition)
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException(
          this.i18n.t(TenantsI18n.errors.TENANT_NAME_TAKEN, {
            args: { name: createTenantDto.name },
          }),
        );
      }
      this.logger.error(`Failed to create tenant: ${error.message}`, error);
      throw new InternalServerErrorException('Failed to create tenant');
    }

    return tenant;
  }

  /**
   * Create tenant for user (self-service signup or admin creation)
   *
   * Orchestrates tenant creation in a single transaction:
   * 1. Create tenant record
   * 2. Link user as tenant_admin
   * 3. Create subscription (defaults to 'navigator' plan)
   *
   * Runs in platform admin context to bypass RLS. RBAC roles are synced on app startup.
   * Entitlement snapshots are created lazily on first access.
   *
   * @throws ConflictException - If user already owns a tenant or tenant name is taken
   * @throws NotFoundException - If specified plan not found
   * @throws BadRequestException - If specified plan not active
   */
  async createTenantForUser(
    userId: string,
    email: string,
    createTenantDto: CreateTenantDto,
  ): Promise<Tenant> {
    const tenant = await this.executeInTenantScope(
      '',
      { mode: 'platform' },
      async (client) => {
        this.logger.log(`Creating tenant for user: ${userId}`);

        const isAdminOfAnyTenant =
          await this.userTenantRepository.userIsTenantAdminOfAny(userId, {
            client,
          });
        if (isAdminOfAnyTenant) {
          throw new ConflictException(
            this.i18n.t(TenantsI18n.errors.USER_ALREADY_HAS_TENANT),
          );
        }

        const isNameTaken = await this.tenantRepository.isNameTaken(
          createTenantDto.name,
          undefined,
          { client },
        );
        if (isNameTaken) {
          throw new ConflictException(
            this.i18n.t(TenantsI18n.errors.TENANT_NAME_TAKEN, {
              args: { name: createTenantDto.name },
            }),
          );
        }

        const created = await this.createTenant(createTenantDto, userId, {
          client,
        });

        await this.userTenantRepository.linkUserToTenant(
          {
            userId,
            tenantId: created.id,
            roleKey: SystemTenantRole.TENANT_ADMIN,
            isActive: true,
          },
          { client },
        );

        this.logger.log(
          `Tenant creation complete: id=${created.id}, user=${userId}`,
        );

        return created;
      },
      {
        allowCrossTenantRead: true,
      },
    );

    void this.queueProducer.enqueue(
      QUEUE_NAMES.TENANT_PROCESSING,
      TENANT_JOB_NAMES.STRIPE_CUSTOMER_CREATION,
      { tenantId: tenant.id, email, userId },
      { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
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
   * @param options - TenantContext for scoped access, or { client } when already inside a transaction
   * @returns The Tenant entity if found and accessible
   *
   * @throws NotFoundException - If tenant not found or access denied by RLS
   * @throws InternalServerErrorException - If database operation fails
   *
   * @example
   * ```ts
   * const tenant = await tenantService.findById('111...');
   * const tenant = await tenantService.findById('111...', { client });
   * ```
   */
  async findById(
    tenantId: string,
    options?: TenantContext | { client: PoolClient },
  ): Promise<Tenant> {
    const client = options && 'client' in options ? options.client : undefined;
    if (client) {
      const tenant = await this.tenantRepository.findById(tenantId, { client });
      if (!tenant) {
        throw new NotFoundException(
          this.i18n.t(TenantsI18n.errors.TENANT_NOT_FOUND, {
            args: { tenantId },
          }),
        );
      }
      return tenant;
    }
    return this.executeInTenantScope(
      tenantId,
      options as TenantContext | undefined,
      (c) => this.findById(tenantId, { client: c }),
    );
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
      throw new InternalServerErrorException(
        this.i18n.t(TenantsI18n.errors.TENANT_FETCH_FAILED),
      );
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      return this.updateOrThrow(tenantId, updateTenantDto, client);
    });
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
    return this.executeInTenantScope(tenantId, undefined, async (client) => {
      return await this.tenantRepository.getDocumentCount(tenantId, {
        client,
      });
    });
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      return this.updateOrThrow(tenantId, { ...dto }, client);
    });
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
    return this.executeInTenantScope(
      tenantId,
      context,
      async (client) => {
        // Check slug uniqueness (requires cross-tenant read for tenant mode)
        const isTaken = await this.tenantRepository.isSlugTaken(
          dto.slug,
          tenantId,
          { client },
        );
        if (isTaken) {
          throw new ConflictException(
            this.i18n.t(TenantsI18n.errors.SLUG_TAKEN, {
              args: { slug: dto.slug },
            }),
          );
        }

        return this.updateOrThrow(tenantId, { slug: dto.slug }, client);
      },
      {
        allowCrossTenantRead: context?.mode === 'tenant',
      },
    );
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      const tenant = await this.findById(tenantId, { client });
      const mergedSettings = dto.settings
        ? deepMerge(tenant.settings || {}, dto.settings)
        : tenant.settings;

      return this.updateOrThrow(
        tenantId,
        {
          ...(dto.locale && { locale: dto.locale }),
          ...(dto.timezone && { timezone: dto.timezone }),
          ...(dto.default_jurisdiction !== undefined && {
            default_jurisdiction: dto.default_jurisdiction,
          }),
          settings: mergedSettings,
        },
        client,
      );
    });
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
    if (!dto.brand_color_primary && !dto.brand_color_secondary) {
      throw new BadRequestException(
        this.i18n.t(TenantsI18n.errors.AT_LEAST_ONE_BRANDING_FIELD_REQUIRED),
      );
    }

    return this.executeInTenantScope(tenantId, context, async (client) => {
      return this.updateOrThrow(tenantId, { ...dto }, client);
    });
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      return this.updateOrThrow(tenantId, { logo_url: logoUrl }, client);
    });
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      const tenant = await this.findById(tenantId, { client });
      if (tenant.onboarding_completed_at) {
        return tenant;
      }
      return this.updateOrThrow(
        tenantId,
        { onboarding_completed_at: new Date() },
        client,
      );
    });
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
    return this.executeInTenantScope(tenantId, context, async (client) => {
      const tenant = await this.findById(tenantId, { client });
      const { currentStep, teamInviteSkipped, firstActionType } = dto;
      const partialMetadata: Record<string, unknown> = Object.fromEntries(
        Object.entries({
          currentStep,
          teamInviteSkipped,
          firstActionType,
        }).filter(([, v]) => v !== undefined),
      );

      // Derive stepsCompleted flags from semantic field changes so the server
      // always owns these — clients set intent, we set completion.
      const stepsCompleted: Partial<StepsCompleted> = {};
      if (teamInviteSkipped === true) {
        stepsCompleted.inviteTeam = true;
      }
      if (firstActionType != null) {
        stepsCompleted.firstAction = true;
      }
      if (Object.keys(stepsCompleted).length > 0) {
        partialMetadata.stepsCompleted = stepsCompleted;
      }

      const mergedMetadata = deepMerge(
        tenant.onboarding_metadata || {},
        partialMetadata,
      );
      return this.updateOrThrow(
        tenantId,
        { onboarding_metadata: mergedMetadata },
        client,
      );
    });
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
    if (context?.mode !== 'platform') {
      throw new ForbiddenException(
        'Only platform administrators can deactivate tenants',
      );
    }

    return this.executeInTenantScope(tenantId, context, async (client) => {
      const tenant = await this.findById(tenantId, { client });
      if (!tenant.is_active) {
        throw new BadRequestException(
          this.i18n.t(TenantsI18n.errors.TENANT_ALREADY_DEACTIVATED, {
            args: { tenantId },
          }),
        );
      }

      const updated = await this.updateOrThrow(
        tenantId,
        {
          is_active: false,
          deactivated_at: new Date(),
          deactivation_reason: dto.reason,
        },
        client,
      );

      this.logger.warn(
        `Tenant ${tenantId} deactivated by admin. Reason: ${dto.reason}`,
      );
      return updated;
    });
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
    if (context?.mode !== 'platform') {
      throw new ForbiddenException(
        'Only platform administrators can reactivate tenants',
      );
    }

    return this.executeInTenantScope(tenantId, context, async (client) => {
      const tenant = await this.findById(tenantId, { client });
      if (tenant.is_active) {
        throw new BadRequestException(
          this.i18n.t(TenantsI18n.errors.TENANT_ALREADY_ACTIVE, {
            args: { tenantId },
          }),
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
    });
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
      return await this.databaseService.transactionWithTenantContext(
        { tenantId: tenantId },
        async (client) => {
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
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `[ADMIN] Failed to update tenant profile: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException('Failed to update tenant profile');
    }
  }
}
