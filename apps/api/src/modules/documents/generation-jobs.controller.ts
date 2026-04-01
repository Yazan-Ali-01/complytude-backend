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
import { GenerationJobResponseDto, GenerationJobStatusDto } from './dto';
import { DocumentPreviewService } from './services/document-preview.service';

const RETRY_AFTER_SECONDS = 3;

function setRetryAfterIfPending(
  reply: FastifyReply,
  status: GenerationJobStatusDto,
): void {
  if (status === 'queued' || status === 'processing') {
    reply.header('Retry-After', String(RETRY_AFTER_SECONDS));
  }
}

@ApiTags('Generation Jobs')
@Controller('generation-jobs')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class GenerationJobsController {
  constructor(
    private readonly documentPreviewService: DocumentPreviewService,
  ) {}

  @Get(':id')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  @ApiOperation({
    summary: 'Get generation job by ID',
    description:
      'Returns a generation job status and result. Poll this endpoint after POST /documents/preview ' +
      'until status is completed or failed. When completed, result contains { previewUrl, expiresAt }.',
  })
  @ApiParam({ name: 'id', description: 'Generation job UUID' })
  @ApiResponse({
    status: 200,
    description: 'Generation job (queued, processing, completed, or failed)',
    type: GenerationJobResponseDto,
  })
  @ApiNotFoundError('Generation job')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to read documents')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<GenerationJobResponseDto> {
    const result = await this.documentPreviewService.getGenerationJobById(
      id,
      user,
    );
    setRetryAfterIfPending(reply, result.status);
    return result;
  }
}
