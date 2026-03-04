import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiAuthErrors,
  ApiForbiddenError,
  ApiNotFoundError,
} from 'src/common/swagger/decorators';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { DocumentsService } from './documents.service';
import { AnalysisJobResponseDto } from './dto';

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
}
