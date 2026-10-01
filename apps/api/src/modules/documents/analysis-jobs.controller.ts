import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Audit } from 'src/common/decorators/audit.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiAuthErrors,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiValidationError,
} from 'src/common/swagger/decorators';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { DocumentsService } from './documents.service';
import {
  AnalysisJobResponseDto,
  FindingFeedbackDto,
  ReviewFindingDto,
} from './dto';

const RETRY_AFTER_SECONDS = 5;

function setRetryAfterIfPending(reply: FastifyReply, status: string): void {
  if (status === 'queued' || status === 'processing') {
    reply.header('Retry-After', String(RETRY_AFTER_SECONDS));
  }
}

@ApiTags('Analysis Jobs')
@Controller('analysis-jobs')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class AnalysisJobsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':id')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  @ApiOperation({
    summary: 'Get analysis job by ID',
    description:
      'Returns a specific analysis job by ID. Poll this endpoint for status and results.',
  })
  @ApiParam({ name: 'id', description: 'Analysis job UUID' })
  @ApiResponse({
    status: 200,
    description: 'Analysis job (queued, processing, completed, or failed)',
    type: AnalysisJobResponseDto,
  })
  @ApiNotFoundError('Analysis job')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to read documents')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AnalysisJobResponseDto> {
    const result = await this.documentsService.getAnalysisJobById(id, user);
    setRetryAfterIfPending(reply, result.status);
    return result;
  }

  @Patch(':id/findings/:findingId')
  @Audit('ANALYSIS_FINDING_REVIEWED', {
    resourceIdParam: 'id',
    includeBody: true,
  })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:create')
  @ApiOperation({
    summary: 'Accept or dismiss a finding',
    description:
      "Records the signed-in user's decision on one finding of a completed analysis (by the finding's id in result.findings), with an optional reason. A later decision on the same finding replaces it. Stored with the analysis's model and prompt version, to measure how often findings are dismissed.",
  })
  @ApiParam({ name: 'id', description: 'Analysis job UUID' })
  @ApiParam({ name: 'findingId', description: "The finding's id" })
  @ApiResponse({
    status: 200,
    description: 'Decision recorded',
    type: FindingFeedbackDto,
  })
  @ApiValidationError()
  @ApiNotFoundError('Analysis job or finding')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to review analyses')
  reviewFinding(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('findingId') findingId: string,
    @Body() dto: ReviewFindingDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<FindingFeedbackDto> {
    return this.documentsService.reviewFinding(id, findingId, dto, user);
  }
}
