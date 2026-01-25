import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Tenant } from './entities/tenant.entity';
import { FeaturesService } from './features.service';
import { TenantService } from './tenant.service';
import { UsageTrackingService } from './usage-tracking.service';
import { UsageSummaryResponseDto } from './dto/usage.dto';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  private readonly logger = new Logger(TenantController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly featuresService: FeaturesService,
    private readonly usageService: UsageTrackingService,
  ) {}

  @Get('me')
  @SwaggerCookieAuth.accessToken()
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

    const tenant = await this.tenantService.findById(user.tenantId);

    const effectiveFeatures = await this.featuresService.getTenantFeatures(
      user.tenantId,
    );

    return {
      ...tenant,
      features: effectiveFeatures,
    };
  }

  @Get('me/usage')
  @SwaggerCookieAuth.accessToken()
  @ApiOperation({
    summary: 'Get my tenant usage',
    description:
      'Get current usage for all metered features in the current billing period.',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage summary for all metered features',
    type: UsageSummaryResponseDto,
  })
  async getMyUsage(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UsageSummaryResponseDto> {
    this.logger.log(`User ${user.userId} fetching their usage`);

    const usageSummary = await this.usageService.getTenantUsageSummary(
      user.tenantId,
    );

    return {
      tenantId: usageSummary.tenantId,
      periodStart: usageSummary.periodStart,
      periodEnd: usageSummary.periodEnd,
      features: usageSummary.features,
    };
  }
}
