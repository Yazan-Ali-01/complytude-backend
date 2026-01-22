import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import {
  AnalyzeContractDto,
  RedlineContractDto,
  ReviewContractDto,
  LocalizerCheckDto,
  ContractAnalysisResponseDto,
  RedlineResponseDto,
} from './dto/contract.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FeaturesGuard } from '../../common/guards/features.guard';
import { UsageLimitGuard } from '../../common/guards/usage-limit.guard';
import { UsageConsumeInterceptor } from '../../common/interceptors/usage-consume.interceptor';
import { RequireFeature } from '../../common/decorators/features.decorator';
import { RequireUsage } from '../../common/decorators/require-usage.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Contracts')
@Controller('contracts')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class ContractsController {
  private readonly logger = new Logger(ContractsController.name);

  constructor(private readonly contractsService: ContractsService) {}

  @Post('analyze')
  @UseGuards(FeaturesGuard, UsageLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequireFeature('risk_analysis_level')
  @RequireUsage('contract_reviews_per_month')
  @Roles('admin', 'member', 'viewer', 'system')
  @ApiOperation({
    summary: 'Analyze contract for risks',
    description: 'AI-powered contract risk analysis. Requires analyzer feature and consumes contract review quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract analysis completed',
    type: ContractAnalysisResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Feature not included in plan' })
  @ApiResponse({ status: 403, description: 'Monthly contract review limit reached' })
  async analyzeContract(
    @Body() dto: AnalyzeContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractAnalysisResponseDto> {
    this.logger.log(
      `User ${user.userId} analyzing contract: ${dto.fileName || 'unnamed'}`,
    );

    return this.contractsService.analyzeContract(
      user.tenantId,
      dto,
      user.userId,
    );
  }

  @Post('redline')
  @UseGuards(FeaturesGuard, UsageLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequireFeature('redlining_enabled')
  @RequireUsage('contract_reviews_per_month')
  @Roles('admin', 'member', 'system')
  @ApiOperation({
    summary: 'Redline contract with suggestions',
    description: 'AI suggests compliant wording alternatives. Requires redlining feature and consumes quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract redlining completed',
    type: RedlineResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Redlining not included in plan' })
  @ApiResponse({ status: 403, description: 'Monthly contract review limit reached' })
  async redlineContract(
    @Body() dto: RedlineContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RedlineResponseDto> {
    this.logger.log(
      `User ${user.userId} redlining contract: ${dto.fileName || 'unnamed'}`,
    );

    return this.contractsService.redlineContract(
      user.tenantId,
      dto,
      user.userId,
    );
  }

  @Post('review')
  @UseGuards(FeaturesGuard, UsageLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequireFeature('risk_analysis_level')
  @RequireUsage('contract_reviews_per_month')
  @Roles('admin', 'member', 'viewer', 'system')
  @ApiOperation({
    summary: 'Review contract comprehensively',
    description: 'Full contract review with risk flags and recommendations. Consumes review quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract review completed',
    type: ContractAnalysisResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Monthly contract review limit reached' })
  async reviewContract(
    @Body() dto: ReviewContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractAnalysisResponseDto> {
    this.logger.log(
      `User ${user.userId} reviewing contract: ${dto.fileName || 'unnamed'}`,
    );

    return this.contractsService.reviewContract(
      user.tenantId,
      dto,
      user.userId,
    );
  }

  @Post('localizer-check')
  @UseGuards(FeaturesGuard, UsageLimitGuard)
  @UseInterceptors(UsageConsumeInterceptor)
  @RequireFeature('localizer_check')
  @RequireUsage('contract_reviews_per_month')
  @Roles('admin', 'member', 'viewer', 'system')
  @ApiOperation({
    summary: 'Jurisdiction compliance check',
    description: 'Flags governing law / jurisdiction mismatches. Requires localizer feature. Consumes review quota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Localizer check completed',
  })
  @ApiResponse({ status: 403, description: 'Localizer check not included in plan' })
  async localizerCheck(
    @Body() dto: LocalizerCheckDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<any> {
    this.logger.log(
      `User ${user.userId} running localizer check on: ${dto.fileName || 'unnamed'}`,
    );

    return this.contractsService.localizerCheck(
      user.tenantId,
      dto,
      user.userId,
    );
  }
}