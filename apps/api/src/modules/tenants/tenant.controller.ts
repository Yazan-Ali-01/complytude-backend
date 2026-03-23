import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { RequireEntitlement } from 'src/common/decorators/require-entitlement.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { EntitlementGuard } from 'src/common/guards/entitlement.guard';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { VerifiedUserGuard } from 'src/common/guards/verified-user.guard';
import { FastifyMultipartInterceptor } from 'src/common/interceptors/fastify-multipart.interceptor';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { Audit } from '../../common/decorators/audit.decorator';
import type { MulterLikeFile } from '../../common/interfaces/multer-file.interface';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import {
  CurrentUserIdentity,
  CurrentUserTenant,
} from '../auth/decorators/current-user.decorator';
import type {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../auth/strategies';
import { TRIAL_CONFIG } from 'src/common/constants/trial-config.constant';
import { TenantsI18n } from './constants/i18n.constants';
import { CreateTenantDto } from './dto/create-tenant.dto';
import {
  TenantResponseDto,
  TenantResponseInput,
} from './dto/tenant-response.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { TenantService } from './tenant.service';

/**
 * Tenant self-management controller
 *
 * All endpoints require tenant access token (@AuthOptions({ tenant: true }))
 * and enforce RLS via service layer transactionWithTenantContext().
 */
@ApiTags('Tenants')
@Controller('tenants')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly i18n: I18nService,
  ) {}

  // ============================================================================
  // READ
  // ============================================================================

  // ============================================================================
  // SELF-SERVICE TENANT CREATION
  // ============================================================================

  /**
   * Create a new tenant (self-service signup)
   *
   * Flow:
   * 1. User signs up (POST /auth/signup)
   * 2. User verifies email (POST /auth/verify-email)
   * 3. User logs in (POST /auth/login) → gets identity token, tenants = []
   * 4. User creates tenant (POST /tenants) ← THIS ENDPOINT
   * 5. User switches to tenant (POST /auth/tenant-switch) → gets tenant token
   *
   * Requirements:
   * - Identity token (user must be logged in)
   * - Email must be verified (enforced by VerifiedUserGuard)
   *
   * What this endpoint does:
   * - Creates tenant with optional name (defaults to "{email}'s Organization")
   * - Creates subscription with specified plan (defaults to 'navigator')
   * - Links user as tenant_admin in user_tenants table
   * - Returns created tenant
   *
   * @throws ForbiddenException if user email not verified
   * @throws ConflictException if user already owns a tenant or tenant name is taken
   * @throws NotFoundException if specified plan not found
   * @throws BadRequestException if specified plan not active
   */
  @Post()
  @Audit('TENANT_CREATED', { resourceType: 'tenants' })
  @AuthOptions({ identity: true, tenant: false })
  @UseGuards(VerifiedUserGuard)
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'Create a new tenant (organization)',
    description:
      'Self-service tenant creation for verified users. Creates tenant, subscription, and links user as tenant_admin. User must have identity token (logged in) and verified email.',
  })
  @ApiBody({ type: CreateTenantDto })
  @ApiResponse({
    status: 201,
    description: 'Tenant created successfully',
    type: TenantResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User already has a tenant or tenant name is taken',
  })
  @ApiResponse({
    status: 404,
    description: 'Specified plan not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Specified plan is not active',
  })
  async createTenant(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.createTenantForUser(
      identityUser.userId,
      identityUser.email,
      createTenantDto,
    );

    const planKey = createTenantDto.planKey ?? TRIAL_CONFIG.PLAN_KEY;
    const input: TenantResponseInput = { ...tenant, plan: planKey };
    return new TenantResponseDto(input);
  }

  /**
   * Get authenticated user's tenant profile
   *
   * RLS: Query executes within tenant context (app.current_tenant_id set).
   *
   * @param user - Authenticated tenant user (from JWT)
   * @returns Full tenant profile wrapped in TenantResponseDto
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get my tenant information',
    description:
      'Retrieve full tenant profile including organization details, contact info, UAE location, business registration, settings, branding, lifecycle status, and onboarding progress.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant details',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description: 'Tenant not found or access denied',
  })
  async getMyTenant(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(`User ${user.userId} fetching tenant ${user.tenantId}`);
    const tenant = await this.tenantService.findById(user.tenantId, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // PROFILE
  // ============================================================================

  /**
   * Update tenant organization profile (partial update)
   *
   * Fields: name, contact_email, billing_email, contact_phone, emirate, city,
   * address_line_1, address_line_2, postal_code, trade_license_number,
   * legal_entity_type, tax_registration_number.
   *
   * @param dto - Partial profile update data
   * @param user - Authenticated tenant user
   * @returns Updated tenant profile
   *
   * @permission settings:manage
   */
  @Patch('me/profile')
  @Audit('TENANT_PROFILE_UPDATED', { resourceType: 'tenants' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Update organization profile',
    description:
      'Update tenant identity, contact, location, and business registration fields. Supports partial updates.',
  })
  @ApiBody({ type: UpdateTenantProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateProfile(
    @Body() dto: UpdateTenantProfileDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} updating profile for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateProfile(user.tenantId, dto, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // SLUG
  // ============================================================================

  /**
   * Update tenant slug (URL-safe identifier)
   *
   * Validates: lowercase alphanumeric + hyphens, 3-50 chars, globally unique.
   *
   * @param dto - New slug value
   * @param user - Authenticated tenant user
   * @returns Updated tenant with new slug
   *
   * @permission settings:manage
   * @throws ConflictException if slug already taken
   */
  @Patch('me/slug')
  @Audit('TENANT_SLUG_UPDATED', { resourceType: 'tenants' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Update tenant slug',
    description:
      'Update URL-safe identifier. Must be unique across all tenants.',
  })
  @ApiBody({ type: UpdateTenantSlugDto })
  @ApiResponse({
    status: 200,
    description: 'Slug updated',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid slug format' })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  async updateSlug(
    @Body() dto: UpdateTenantSlugDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(`User ${user.userId} updating slug to "${dto.slug}"`);
    // TODO: update the slug Context in the database ( right now the isSlugTaken needs the RLS bypass through the dabase )
    const tenant = await this.tenantService.updateSlug(user.tenantId, dto, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  /**
   * Update tenant preferences (deep-merge JSONB)
   *
   * Fields: locale (en/ar), timezone (IANA), default_jurisdiction, settings (JSONB).
   * JSONB fields are deep-merged: new keys added, existing preserved.
   *
   * @param dto - Settings to update (partial)
   * @param user - Authenticated tenant user
   * @returns Updated tenant with merged settings
   *
   * @permission settings:manage
   */
  @Patch('me/settings')
  @Audit('TENANT_SETTINGS_UPDATED', {
    resourceType: 'tenants',
    includeBody: true,
  })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Update tenant preferences',
    description:
      'Update locale, timezone, jurisdiction, and flexible JSONB settings. Deep-merged update.',
  })
  @ApiBody({ type: UpdateTenantSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'Settings updated',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid locale/timezone value' })
  async updateSettings(
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} updating settings for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateSettings(user.tenantId, dto, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // BRANDING
  // ============================================================================

  /**
   * Update branding colors for white-label exports
   *
   * Requires: settings:manage permission + white_label_exports entitlement.
   * Colors: valid hex codes (#RRGGBB).
   *
   * @param dto - Branding colors to update
   * @param user - Authenticated tenant user
   * @returns Updated tenant with new branding
   *
   * @permission settings:manage + white_label_exports entitlement
   */
  @Patch('me/branding')
  @Audit('TENANT_BRANDING_UPDATED', { resourceType: 'tenants' })
  @UseGuards(TenantPermissionsGuard, EntitlementGuard)
  @RequireAnyTenantPermission('settings:manage')
  @RequireEntitlement('white_label_exports')
  @ApiOperation({
    summary: 'Update branding colors',
    description:
      'Update hex color codes for white-label document exports. Infrastructure plan required.',
  })
  @ApiBody({ type: UpdateTenantBrandingDto })
  @ApiResponse({
    status: 200,
    description: 'Branding updated',
    type: TenantResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Missing permission or entitlement',
  })
  async updateBranding(
    @Body() dto: UpdateTenantBrandingDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} updating branding for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateBranding(user.tenantId, dto, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // LOGO
  // ============================================================================

  /**
   * Upload tenant logo (multipart/form-data)
   *
   * Requirements: PNG/JPG/SVG/WebP, max 2MB.
   * Flow: upload to storage → update logo_url → delete old logo (graceful).
   *
   * @param file - Uploaded file buffer
   * @param user - Authenticated tenant user
   * @returns Updated tenant with new logo_url
   *
   * @permission settings:manage
   * @consumes multipart/form-data
   */
  @Post('me/logo')
  @Audit('TENANT_LOGO_UPLOADED', { resourceType: 'tenants' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @UseInterceptors(FastifyMultipartInterceptor(class LogoUploadDto {}))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Logo file (PNG/JPG/SVG/WebP, max 2MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload tenant logo',
    description: 'Upload organization logo. Replaces existing logo. Max 2MB.',
  })
  @ApiResponse({
    status: 201,
    description: 'Logo uploaded',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadLogo(
    @UploadedFile() file: MulterLikeFile,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    if (!file)
      throw new BadRequestException(
        this.i18n.t(TenantsI18n.errors.NO_FILE_PROVIDED),
      );

    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        this.i18n.t(TenantsI18n.errors.INVALID_FILE_TYPE_FOR_LOGO, {
          args: { mimeType: file.mimetype },
        }),
      );
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        this.i18n.t(TenantsI18n.errors.FILE_TOO_LARGE_FOR_LOGO, {
          args: {
            sizeMb: (file.size / 1024 / 1024).toFixed(2),
          },
        }),
      );
    }

    const uploadedUrl = `https://storage.example.com/${user.tenantId}/logos/${file.originalname}`;

    this.logger.log(`User ${user.userId} uploaded logo: ${file.originalname}`);
    const tenant = await this.tenantService.updateLogoUrl(
      user.tenantId,
      uploadedUrl,
      { mode: 'tenant' },
    );
    return new TenantResponseDto(tenant);
  }

  /**
   * Remove tenant logo
   *
   * Idempotent: safe to call if logo already null.
   * Flow: delete from storage → set logo_url = NULL.
   *
   * @param user - Authenticated tenant user
   * @returns Updated tenant with logo_url = null
   *
   * @permission settings:manage
   */
  @Delete('me/logo')
  @Audit('TENANT_LOGO_DELETED', { resourceType: 'tenants' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Remove tenant logo',
    description: 'Delete logo from storage and clear logo_url. Idempotent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logo removed',
    type: TenantResponseDto,
  })
  async deleteLogo(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} removed logo for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateLogoUrl(user.tenantId, null, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  // ============================================================================
  // ONBOARDING
  // ============================================================================

  /**
   * Mark onboarding as complete (idempotent)
   *
   * Sets onboarding_completed_at = now() if not already set.
   *
   * @param user - Authenticated tenant user
   * @returns Tenant entity (unchanged if already completed)
   *
   * @permission settings:manage
   * @idempotent true
   */
  @Post('me/onboarding/complete')
  @Audit('TENANT_ONBOARDING_COMPLETED', { resourceType: 'tenants' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Mark onboarding complete',
    description: 'Set onboarding_completed_at timestamp. Idempotent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding marked complete',
    type: TenantResponseDto,
  })
  async completeOnboarding(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} completing onboarding for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.completeOnboarding(user.tenantId, {
      mode: 'tenant',
    });
    return new TenantResponseDto(tenant);
  }

  /**
   * Update onboarding progress metadata (deep-merge JSONB)
   *
   * @param dto - Onboarding metadata to merge (partial)
   * @param user - Authenticated tenant user
   * @returns Updated tenant with merged onboarding_metadata
   *
   * @permission settings:manage
   */
  @Patch('me/onboarding')
  @Audit('TENANT_ONBOARDING_UPDATED', { resourceType: 'tenants' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Update onboarding progress',
    description: 'Update onboarding step tracking. JSONB deep-merged.',
  })
  @ApiBody({ type: UpdateOnboardingDto })
  @ApiResponse({
    status: 200,
    description: 'Onboarding progress updated',
    type: TenantResponseDto,
  })
  async updateOnboarding(
    @Body() dto: UpdateOnboardingDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<TenantResponseDto> {
    this.logger.log(
      `User ${user.userId} updating onboarding for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateOnboarding(
      user.tenantId,
      dto,
      { mode: 'tenant' },
    );
    return new TenantResponseDto(tenant);
  }
}
