import {
  Controller,
  Post,
  Get,
  UseGuards,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RegulatoryService } from './regulatory.service';
import {
  RegulatoryQueryDto,
  LicenseVerifierDto,
  RegulatoryQueryResponseDto,
  LicenseVerifierResponseDto,
} from './dto/regulatory.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  UseRoleRateLimit,
  UseAiModelCheck,
} from '../../common/decorators/rbac.decorators';
import { FeaturesGuard } from '../../common/guards/features.guard';
import { UsageLimitGuard } from '../../common/guards/usage-limit.guard';
import { AiModelGuard } from '../../common/guards/ai-model.guard';
import { RoleRateLimitGuard } from '../../common/guards/role-rate-limit.guard';
import { UsageConsumeInterceptor } from '../../common/interceptors/usage-consume.interceptor';
import { RequireFeature } from '../../common/decorators/features.decorator';
import { RequireUsage } from '../../common/decorators/require-usage.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Regulatory Hub')
@Controller('regulatory')
@ApiBearerAuth()
export class RegulatoryController {
  private readonly logger = new Logger(RegulatoryController.name);

  constructor(private readonly regulatoryService: RegulatoryService) {}

  @Post('query')
  @UseGuards(FeaturesGuard, UsageLimitGuard, AiModelGuard, RoleRateLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequirePermissions('regulatory:query')
  @RequireFeature('regulatory_hub_access')
  @RequireUsage('regulatory_queries_per_month')
  @UseAiModelCheck()
  @UseRoleRateLimit()
  @ApiOperation({
    summary: 'Query regulatory database',
    description:
      'AI-powered legal research (Chat with Law). Requires Regulatory Hub access. Consumes query quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Regulatory query completed',
    type: RegulatoryQueryResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Regulatory Hub not included in plan',
  })
  @ApiResponse({
    status: 403,
    description: 'Monthly regulatory query limit reached',
  })
  async queryRegulatory(
    @Query() dto: RegulatoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RegulatoryQueryResponseDto> {
    this.logger.log(`User ${user.userId} querying regulatory hub`);

    return this.regulatoryService.queryRegulatory(
      user.tenantId,
      dto,
      user.userId,
    );
  }

  @Post('license-verify')
  @UseGuards(FeaturesGuard, UsageLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequirePermissions('regulatory:query')
  @RequireFeature('regulatory_hub_access')
  @RequireUsage('license_verifier_lookups')
  @ApiOperation({
    summary: 'Verify business license via DED API',
    description: 'Check license status through DED API. Consumes lookup quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'License verification completed',
    type: LicenseVerifierResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'License verifier not included in plan',
  })
  @ApiResponse({ status: 403, description: 'Monthly lookup limit reached' })
  async verifyLicense(
    @Query() dto: LicenseVerifierDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LicenseVerifierResponseDto> {
    this.logger.log(
      `User ${user.userId} verifying license: ${dto.licenseNumber || 'unknown'}`,
    );

    return this.regulatoryService.verifyLicense(
      user.tenantId,
      dto,
      user.userId,
    );
  }

  @Get('dashboard')
  @UseGuards(FeaturesGuard)
  @RequirePermissions('regulatory:query')
  @RequireFeature('regulatory_hub_access')
  @ApiOperation({
    summary: 'Get regulatory dashboard data',
    description:
      'Access to regulatory compliance dashboard. Requires Regulatory Hub feature.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved',
  })
  @ApiResponse({
    status: 403,
    description: 'Regulatory Hub not included in plan',
  })
  async getDashboard(@CurrentUser() user: AuthenticatedUser): Promise<any> {
    this.logger.log(`User ${user.userId} accessing regulatory dashboard`);

    return this.regulatoryService.getDashboard(user.tenantId);
  }
}
