import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RequireEntitlement } from 'src/common/decorators/require-entitlement.decorator';
import { RequireAnyTenantPermission } from 'src/common/decorators/tenant-permissions.decorator';
import { EntitlementGuard } from 'src/common/guards/entitlement.guard';
import { TenantPermissionsGuard } from 'src/common/guards/tenant-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiAuthErrors,
  ApiConflictError,
  ApiForbiddenError,
  ApiListResponses,
  ApiNotFoundError,
  ApiValidationError,
} from 'src/common/swagger/decorators';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import { CurrentUserTenant } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { DocumentsService } from './documents.service';
import {
  AnalysisJobResponseDto,
  AnalyzeDocumentDto,
  AnalyzeDocumentResponseDto,
  ConfirmUploadResponseDto,
  DeleteDocumentResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  ListDocumentsQueryDto,
  UploadUrlDto,
  UploadUrlResponseDto,
} from './dto';

const RETRY_AFTER_SECONDS = 5;

function setRetryAfterIfPending(reply: FastifyReply, status: string): void {
  if (status === 'queued' || status === 'processing') {
    reply.header('Retry-After', String(RETRY_AFTER_SECONDS));
  }
}

@ApiTags('Documents')
@Controller('documents')
@AuthOptions({ tenant: true })
@SwaggerCookieAuth.tenantAccessToken()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  @ApiOperation({
    summary: 'List documents',
    description:
      'Returns a paginated list of documents for the authenticated tenant. ' +
      'Supports search by title, sorting, and pagination.',
  })
  @ApiListResponses(DocumentListResponseDto, 'Documents')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to read documents')
  list(
    @Query() query: ListDocumentsQueryDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<DocumentListResponseDto> {
    return this.documentsService.findAll(query, user);
  }

  @Get(':documentId')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  @ApiOperation({
    summary: 'Get document by ID',
    description:
      'Returns the full document details including content, metadata, and file storage information.',
  })
  @ApiParam({ name: 'documentId', description: 'Document UUID' })
  @ApiResponse({
    status: 200,
    description: 'Document details',
    type: DocumentResponseDto,
  })
  @ApiNotFoundError('Document')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to read documents')
  findOne(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(documentId, user);
  }

  @Delete(':documentId')
  @Audit('DOCUMENT_DELETED', { resourceType: 'documents' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:delete')
  @ApiOperation({
    summary: 'Delete a document',
    description:
      'Permanently deletes a document and its associated S3 objects. This action cannot be undone.',
  })
  @ApiParam({ name: 'documentId', description: 'Document UUID' })
  @ApiResponse({
    status: 200,
    description: 'Document deleted',
    type: DeleteDocumentResponseDto,
  })
  @ApiNotFoundError('Document')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to delete documents')
  remove(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<DeleteDocumentResponseDto> {
    return this.documentsService.remove(documentId, user);
  }

  @Get(':documentId/analysis')
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:read')
  @ApiOperation({
    summary: 'Get latest analysis job for document',
    description:
      'Returns the latest analysis job for the given document. Poll this endpoint for status and results.',
  })
  @ApiParam({ name: 'documentId', description: 'Document UUID' })
  @ApiResponse({
    status: 200,
    description:
      'Latest analysis job (queued, processing, completed, or failed)',
    type: AnalysisJobResponseDto,
  })
  @ApiNotFoundError('Document or analysis job')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to read documents')
  async getLatestAnalysis(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AnalysisJobResponseDto> {
    const result = await this.documentsService.getLatestAnalysis(
      documentId,
      user,
    );
    setRetryAfterIfPending(reply, result.status);
    return result;
  }

  @Post('upload-url')
  @Audit('DOCUMENT_UPLOAD_URL_GENERATED', { resourceType: 'documents' })
  @UseGuards(TenantPermissionsGuard, EntitlementGuard)
  @RequireAnyTenantPermission('documents:create')
  @RequireEntitlement({ featureKey: 'document_scans', minValue: 1 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate presigned S3 PUT URL for direct document upload',
    description:
      'Creates a document record in pending extraction state and returns a presigned S3 PUT URL ' +
      'for the client to upload the file directly to the quarantine bucket. ' +
      'The client must PUT the file to the returned URL with the matching Content-Type header. ' +
      'No job is enqueued here — that happens on upload confirmation (next step).',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned upload URL generated and document record created',
    type: UploadUrlResponseDto,
  })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiForbiddenError(
    'Insufficient permissions or document_scans quota exhausted',
  )
  getUploadUrl(
    @Body() dto: UploadUrlDto,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<UploadUrlResponseDto> {
    return this.documentsService.getUploadUrl(dto, user);
  }

  @Post(':documentId/confirm-upload')
  @Audit('DOCUMENT_UPLOAD_CONFIRMED', { resourceType: 'documents' })
  @UseGuards(TenantPermissionsGuard)
  @RequireAnyTenantPermission('documents:create')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Confirm document upload and enqueue ingestion job',
    description:
      'After uploading a file directly to S3 via the presigned URL, call this endpoint to confirm ' +
      'the upload succeeded. The API validates the file exists in S3, checks the file size, ' +
      'and enqueues a DOCUMENT_INGESTION job for text extraction.',
  })
  @ApiParam({ name: 'documentId', description: 'Document UUID' })
  @ApiResponse({
    status: 202,
    description: 'Upload confirmed and ingestion job enqueued',
    type: ConfirmUploadResponseDto,
  })
  @ApiValidationError()
  @ApiNotFoundError('Document')
  @ApiConflictError('Document already confirmed (UPLOAD_ALREADY_CONFIRMED)')
  @ApiAuthErrors()
  @ApiForbiddenError('Insufficient permissions to confirm document upload')
  confirmUpload(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUserTenant() user: AuthenticatedTenantUser,
  ): Promise<ConfirmUploadResponseDto> {
    return this.documentsService.confirmUpload(documentId, user);
  }

  @Post('analyze')
  @Audit('DOCUMENT_ANALYSIS_TRIGGERED', { resourceType: 'documents' })
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
