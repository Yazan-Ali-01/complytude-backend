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
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';
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
@UseGuards(SystemAdminGuard)
@SwaggerCookieAuth.identityAccessToken()
export class TenantAdminController {
  private readonly logger = new Logger(TenantAdminController.name);

  constructor(private readonly tenantService: TenantService) {}

  // ============================================================================
  // SYSTEM ADMIN ENDPOINTS (Platform-wide management)
  // ============================================================================

  @Get()
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
  async getAllTenants(
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<TenantResponseDto[]> {
    this.logger.log('[ADMIN] Fetching all tenants');
    const tenants = await this.tenantService.findAll({
      cursor,
      limit,
      direction,
    });
    return tenants.data.map((tenant) => new TenantResponseDto(tenant));
  }

  @Get(':tenantId')
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
    const tenant = await this.tenantService.findById(tenantId);
    return new TenantResponseDto(tenant);
  }

  @Put(':tenantId')
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
    );
    return new TenantResponseDto(tenant);
  }

  @Delete(':tenantId')
  @HttpCode(HttpStatus.OK)
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
  async deleteTenant(@Param('tenantId') tenantId: string): Promise<void> {
    this.logger.warn(`[ADMIN] Deleting tenant: ${tenantId}`);
    await this.tenantService.deleteTenant(tenantId);
    return;
  }
}
