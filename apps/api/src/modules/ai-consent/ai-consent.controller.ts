import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { AiConsentService } from './ai-consent.service';
import { AcceptAiDisclosureDto } from './dto/accept-ai-disclosure.dto';
import { AiConsentStatusDto } from './dto/ai-consent-status.dto';

@ApiTags('Tenants')
@Controller('tenants/me/ai-consent')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class AiConsentController {
  constructor(private readonly aiConsentService: AiConsentService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the organization’s AI processing consent',
    description:
      'The current disclosure version and whether the organization has accepted it. Until it has, contract analysis and uploads answer 403 with reason ai_consent_required.',
  })
  @ApiResponse({ status: 200, type: AiConsentStatusDto })
  async getStatus(
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<AiConsentStatusDto> {
    return this.aiConsentService.getStatus(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('settings:manage')
  @ApiOperation({
    summary: 'Accept the AI processing disclosure',
    description:
      'A tenant admin accepts the current disclosure version for the organization (recorded with who and when, and audited as AI_PROCESSING_ACCEPTED). Accepting a version already accepted changes nothing.',
  })
  @ApiBody({ type: AcceptAiDisclosureDto })
  @ApiResponse({ status: 200, type: AiConsentStatusDto })
  @ApiResponse({
    status: 400,
    description: 'Not the current disclosure version',
  })
  @ApiResponse({ status: 403, description: 'Missing settings:manage' })
  async accept(
    @Body() dto: AcceptAiDisclosureDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<AiConsentStatusDto> {
    return this.aiConsentService.accept(
      user.tenantId,
      user.userId,
      dto.version,
    );
  }
}
