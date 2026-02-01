import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Tenant } from './entities/tenant.entity';
import { FeaturesService } from './features.service';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly featuresService: FeaturesService,
  ) {}

  // ============================================================================
  // SELF-MANAGEMENT ENDPOINTS (Read-only access to own tenant)
  // ============================================================================

  @Get('me')
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Get my tenant information',
    description:
      'Get read-only information about your tenant including plan and active features. Use billing portal for plan upgrades.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Your tenant details with effective features (plan defaults + custom overrides)',
    type: Object,
  })
  async getMyTenant(@CurrentUser() user: AuthenticatedUser): Promise<Tenant> {
    this.logger.log(`User ${user.userId} fetching their tenant info`);

    // Get tenant data
    const tenant = await this.tenantService.findById(user.tenantId);

    // Get effective features (plan defaults + custom overrides)
    const effectiveFeatures = await this.featuresService.getTenantFeatures(
      user.tenantId,
    );

    // Return tenant with effective features instead of just DB custom overrides
    return {
      ...tenant,
      features: effectiveFeatures,
    };
  }
}
