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
import { RequireAnyPermission } from 'src/common/decorators/permissions.decorator';
import { RequireEntitlement } from 'src/common/decorators/require-entitlement.decorator';
import { EntitlementGuard } from 'src/common/guards/entitlement.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { FastifyMultipartInterceptor } from 'src/common/interceptors/fastify-multipart.interceptor';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import type { MulterLikeFile } from '../../common/interfaces/multer-file.interface';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { StorageService } from '../mock/storage-mock.service';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { TenantService } from './tenant.service';

/** @internal Helper DTO for multipart file validation */
class LogoUploadDto {}

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
    private readonly storageService: StorageService,
  ) {}

  // ============================================================================
  // READ
  // ============================================================================

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
    const tenant = await this.tenantService.findById(user.tenantId);
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
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    const tenant = await this.tenantService.updateProfile(user.tenantId, dto);
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
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    const tenant = await this.tenantService.updateSlug(user.tenantId, dto);
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
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    const tenant = await this.tenantService.updateSettings(user.tenantId, dto);
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
  @UseGuards(PermissionsGuard, EntitlementGuard)
  @RequireAnyPermission('settings:manage')
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
    const tenant = await this.tenantService.updateBranding(user.tenantId, dto);
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
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
  @UseInterceptors(FastifyMultipartInterceptor(LogoUploadDto))
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
    if (!file) throw new BadRequestException('No file provided');

    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: PNG, JPG, SVG, WebP. Received: ${file.mimetype}`,
      );
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum: 2MB. Received: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    const currentTenant = await this.tenantService.findById(user.tenantId);
    const uploadResult = await this.storageService.uploadFile(
      user.tenantId,
      file.buffer,
      file.originalname,
      file.mimetype,
      user.userId,
    );

    // Cleanup old logo (graceful degradation)
    if (currentTenant.logo_url) {
      try {
        const parts = currentTenant.logo_url.split('/');
        const oldKey = parts.slice(-2).join('/');
        if (oldKey) await this.storageService.deleteFile(user.tenantId, oldKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete old logo for tenant ${user.tenantId}: ${error.message}`,
        );
      }
    }

    this.logger.log(`User ${user.userId} uploaded logo: ${uploadResult.key}`);
    const tenant = await this.tenantService.updateLogoUrl(
      user.tenantId,
      uploadResult.url,
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    const currentTenant = await this.tenantService.findById(user.tenantId);

    if (currentTenant.logo_url) {
      try {
        const parts = currentTenant.logo_url.split('/');
        const key = parts.slice(-2).join('/');
        if (key) await this.storageService.deleteFile(user.tenantId, key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete logo from storage: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `User ${user.userId} removed logo for tenant ${user.tenantId}`,
    );
    const tenant = await this.tenantService.updateLogoUrl(user.tenantId, null);
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
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    const tenant = await this.tenantService.completeOnboarding(user.tenantId);
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
  @UseGuards(PermissionsGuard)
  @RequireAnyPermission('settings:manage')
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
    );
    return new TenantResponseDto(tenant);
  }
}
