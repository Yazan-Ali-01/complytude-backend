import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { RequireAnyPlatformPermission } from '../../common/decorators/platform-permissions.decorator';
import { MessageResponseDto } from '../../common/dto';
import { TenantCursorPaginatedResponseDto } from '../../common/dto/tenant-cursor-paginated-response.dto';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
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
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction') direction?: 'forward' | 'backward',
  ): Promise<TenantCursorPaginatedResponseDto> {
    this.logger.log('[ADMIN] Fetching all tenants');

    const result = await this.tenantService.findAll(
      { cursor, limit, direction },
      { platformAdminContext: true },
    );

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
      platformAdminContext: true,
    });
    return new TenantResponseDto(tenant);
  }

  @Put(':tenantId')
  @RequireAnyPlatformPermission('tenants:update')
  @ApiOperation({
    summary: '[ADMIN] Update any tenant',
    description:
      'Updates any tenant including plan and features. System admin only. Use this to grant custom features or change plans.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() updateTenantDto: UpdateTenantDto,
  ): Promise<TenantResponseDto> {
    this.logger.log(`[ADMIN] Updating tenant: ${tenantId}`);
    const tenant = await this.tenantService.updateTenant(
      tenantId,
      updateTenantDto,
      {
        platformAdminContext: true,
      },
    );
    return new TenantResponseDto(tenant);
  }

  @Delete(':tenantId')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPlatformPermission('tenants:delete')
  @ApiOperation({
    summary: '[ADMIN] Delete any tenant',
    description:
      'Deletes any tenant and all associated data. ⚠️ This action is irreversible. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async deleteTenant(
    @Param('tenantId') tenantId: string,
  ): Promise<MessageResponseDto> {
    this.logger.warn(`[ADMIN] Deleting tenant: ${tenantId}`);
    await this.tenantService.deleteTenant(tenantId, {
      platformAdminContext: true,
    });
    return new MessageResponseDto('Tenant deleted successfully');
  }
}
