import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequireAnyPlatformPermission } from '../../common/decorators/platform-permissions.decorator';
import { CursorQueryParamsDto } from '../../common/dto/cursor-query-params.dto';
import { TenantCursorPaginatedResponseDto } from '../../common/dto/tenant-cursor-paginated-response.dto';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { DeactivateTenantDto } from './dto/deactivate-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { TenantService } from './tenant.service';

/**
 * System Administrator endpoints for tenant management
 * All endpoints require system admin privileges via identity token
 */
@ApiTags('System Admin - Tenants')
@Controller('admin/tenants')
@AuthOptions({ identity: true })
@UseGuards(PlatformPermissionsGuard)
@SwaggerCookieAuth.identityAccessToken()
export class TenantAdminController {
  private readonly logger = new Logger(TenantAdminController.name);

  constructor(private readonly tenantService: TenantService) {}

  // ============================================================================
  // SYSTEM ADMIN ENDPOINTS (Platform-wide management)
  // ============================================================================

  @Get()
  @RequireAnyPlatformPermission('tenants:read')
  @ApiOperation({
    summary: '[ADMIN] List all tenants',
    description:
      'Retrieves a list of all tenants in the system. System admin only.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['forward', 'backward'],
    description: 'Pagination direction (default: forward)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all tenants',
    type: [Object],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of tenants',
    type: TenantCursorPaginatedResponseDto, // ✅ Proper Swagger type
  })
  async getAllTenants(
    @Query() query: CursorQueryParamsDto,
  ): Promise<TenantCursorPaginatedResponseDto> {
    this.logger.log('[ADMIN] Fetching all tenants');

    const result = await this.tenantService.findAll(query, {
      mode: 'platform',
    });

    return TenantCursorPaginatedResponseDto.fromResult(
      result,
      (tenant) => new TenantResponseDto(tenant),
    );
  }

  @Get(':tenantId')
  @RequireAnyPlatformPermission('tenants:read')
  @ApiOperation({
    summary: '[ADMIN] Get tenant by ID',
    description:
      'Retrieves detailed information about any tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant details',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantById(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantResponseDto> {
    this.logger.log(`[ADMIN] Fetching tenant: ${tenantId}`);
    const tenant = await this.tenantService.findById(tenantId, {
      mode: 'platform',
    });
    return new TenantResponseDto(tenant);
  }

  @Patch(':tenantId/profile')
  @Audit('TENANT_PROFILE_UPDATED', {
    resourceIdParam: 'tenantId',
    resourceType: 'tenants',
    includeBody: true,
  })
  @RequireAnyPlatformPermission('tenants:update')
  @ApiOperation({
    summary: '[ADMIN] Update organization profile',
    description:
      'Update tenant identity, contact, location, and business registration fields. Supports partial updates.',
  })
  @ApiParam({ name: 'tenantId', description: 'Target Tenant ID' }) // ✅ Added param docs
  @ApiBody({ type: UpdateTenantProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Tenant not found' }) // ✅ Added 404
  async updateProfile(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantProfileDto,
  ): Promise<TenantResponseDto> {
    this.logger.log(`[ADMIN] Updating profile for tenant: ${tenantId}`);
    const tenant = await this.tenantService.updateProfile(tenantId, dto, {
      mode: 'platform',
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
  @Patch(':tenantId/slug')
  @Audit('TENANT_SLUG_UPDATED', {
    resourceIdParam: 'tenantId',
    resourceType: 'tenants',
  })
  @RequireAnyPlatformPermission('tenants:update')
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
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantSlugDto,
  ): Promise<TenantResponseDto> {
    this.logger.log(`[ADMIN] Updating slug for tenant: ${tenantId}`);
    const tenant = await this.tenantService.updateSlug(tenantId, dto, {
      mode: 'platform',
    });
    return new TenantResponseDto(tenant);
  }

  @Post(':tenantId/deactivate')
  @Audit('TENANT_DEACTIVATED', {
    resourceIdParam: 'tenantId',
    resourceType: 'tenants',
  })
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('tenants:update')
  @ApiOperation({
    summary: '[ADMIN] Deactivate a tenant',
    description:
      'Soft-deletes a tenant by setting is_active=false. Tenant data is preserved but access is revoked. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant deactivated successfully',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Tenant already deactivated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async deactivateTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: DeactivateTenantDto,
  ): Promise<TenantResponseDto> {
    this.logger.warn(`[ADMIN] Deactivating tenant: ${tenantId}`);
    const tenant = await this.tenantService.deactivateTenant(tenantId, dto, {
      mode: 'platform',
    });
    return new TenantResponseDto(tenant);
  }

  @Post(':tenantId/reactivate')
  @Audit('TENANT_REACTIVATED', {
    resourceIdParam: 'tenantId',
    resourceType: 'tenants',
  })
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('tenants:update')
  @ApiOperation({
    summary: '[ADMIN] Reactivate a tenant',
    description:
      'Restores a previously deactivated tenant by setting is_active=true. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant reactivated successfully',
    type: TenantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Tenant already active' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async reactivateTenant(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantResponseDto> {
    this.logger.log(`[ADMIN] Reactivating tenant: ${tenantId}`);
    const tenant = await this.tenantService.reactivateTenant(tenantId, {
      mode: 'platform',
    });
    return new TenantResponseDto(tenant);
  }
}
