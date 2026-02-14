import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(private readonly tenantService: TenantService) {}

  // ============================================================================
  // SELF-MANAGEMENT ENDPOINTS (Read-only access to own tenant)
  // ============================================================================

  @Get('me')
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Get my tenant information',
    description:
      'Get read-only information about your tenant including plan. Use /entitlements/current for feature details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Your tenant details',
    type: Object,
  })
  async getMyTenant(@CurrentUser() user: AuthenticatedUser): Promise<Tenant> {
    this.logger.log(`User ${user.userId} fetching their tenant info`);

    // Get tenant data
    const tenant = await this.tenantService.findById(user.tenantId);

    return tenant;
  }
}
