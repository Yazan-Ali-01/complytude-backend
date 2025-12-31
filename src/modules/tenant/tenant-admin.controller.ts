import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { I18nService, I18nContext } from 'nestjs-i18n';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';

/**
 * System Administrator endpoints for tenant management
 * All endpoints require system admin privileges
 */
@ApiTags('System Admin - Tenants')
@Controller('admin/tenants')
@UseGuards(SystemAdminGuard)
@ApiBearerAuth()
export class TenantAdminController {
  private readonly logger = new Logger(TenantAdminController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly i18n: I18nService,
  ) {}

  // ============================================================================
  // SYSTEM ADMIN ENDPOINTS (Platform-wide management)
  // ============================================================================

  @Get()
  @ApiOperation({
    summary: '[ADMIN] List all tenants',
    description:
      'Retrieves a list of all tenants in the system. System admin only.',
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
  async getAllTenants(): Promise<Tenant[]> {
    this.logger.log('[ADMIN] Fetching all tenants');
    return this.tenantService.findAll();
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
  async getTenantById(@Param('tenantId') tenantId: string): Promise<Tenant> {
    this.logger.log(`[ADMIN] Fetching tenant: ${tenantId}`);
    return this.tenantService.findById(tenantId);
  }

  @Get('email/:email')
  @ApiOperation({
    summary: '[ADMIN] Get tenant by email',
    description:
      'Retrieves tenant information by email address. System admin only.',
  })
  @ApiParam({ name: 'email', description: 'Tenant email' })
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
  async getTenantByEmail(@Param('email') email: string): Promise<Tenant> {
    this.logger.log(`[ADMIN] Fetching tenant by email: ${email}`);
    return this.tenantService.findByEmail(email);
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
  ): Promise<Tenant> {
    this.logger.log(`[ADMIN] Updating tenant: ${tenantId}`);
    return this.tenantService.updateTenant(tenantId, updateTenantDto);
  }

  @Delete(':tenantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Delete any tenant',
    description:
      'Deletes any tenant and all associated data including the database schema. ⚠️ This action is irreversible. System admin only.',
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
  ): Promise<{ message: string; tenantId: string }> {
    this.logger.warn(`[ADMIN] Deleting tenant: ${tenantId}`);
    await this.tenantService.deleteTenant(tenantId);
    return {
      message: this.i18n.t('tenant.messages.deleted', {
        lang: I18nContext.current()?.lang,
      }),
      tenantId,
    };
  }

  @Get(':tenantId/schema')
  @ApiOperation({
    summary: '[ADMIN] Get any tenant schema',
    description: 'Retrieves schema details for any tenant. System admin only.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({
    status: 200,
    description: 'Tenant schema information',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Schema not found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin privileges required',
  })
  async getTenantSchema(@Param('tenantId') tenantId: string) {
    this.logger.log(`[ADMIN] Fetching schema for tenant: ${tenantId}`);
    return this.tenantService.getTenantSchema(tenantId);
  }
}
