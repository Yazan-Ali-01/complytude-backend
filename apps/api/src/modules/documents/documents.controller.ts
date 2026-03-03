import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiAuthErrors,
  ApiForbiddenError,
  ApiValidationError,
} from 'src/common/swagger/decorators';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { DocumentsService } from './documents.service';
import { AnalyzeDocumentDto, AnalyzeDocumentResponseDto } from './dto';

@ApiTags('Documents')
@Controller('documents')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('analyze')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:create')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Upload document and trigger compliance analysis',
    description:
      'Creates a document record from plain text, queues a compliance analysis job, ' +
      'and immediately returns 202 Accepted with the document ID and analysis job ID. ' +
      'Poll GET /analysis-jobs/:id for status and results.',
  })
  @ApiResponse({
    status: 202,
    description: 'Document created and analysis job queued',
    type: AnalyzeDocumentResponseDto,
  })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to create documents')
  analyze(
    @Body() dto: AnalyzeDocumentDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<AnalyzeDocumentResponseDto> {
    return this.documentsService.analyze(dto, user);
  }
}
