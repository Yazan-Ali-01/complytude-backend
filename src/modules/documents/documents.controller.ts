import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationMetaDto } from 'src/common/dto';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiConflictError,
  ApiCreateResponses,
  ApiDeleteResponses,
  ApiForbiddenError,
  ApiGetResponses,
  ApiListResponses,
  ApiNotFoundError,
} from 'src/common/swagger/decorators';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DocumentsService } from './documents.service';
import {
  DeleteDocumentResponseDto,
  DocumentIdParamDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
  ListDocumentsQueryDto,
  PreviewDocumentDto,
  PreviewDocumentResponseDto,
} from './dto';

@ApiTags('Documents')
@Controller('documents')
@SwaggerCookieAuth.accessToken()
@ApiExtraModels(
  DocumentResponseDto,
  DocumentListResponseDto,
  GenerateDocumentResponseDto,
  PreviewDocumentResponseDto,
  DeleteDocumentResponseDto,
  PaginationMetaDto,
)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('preview')
  @UseGuards(RolesGuard)
  @Roles('admin', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate document preview',
    description:
      'Generate a temporary preview document (DOCX or PDF) for user review before final generation. ' +
      'Preview files are temporary with short-lived signed URLs (15 minutes) and are not saved to the documents table. ' +
      'Requires admin or member role.',
  })
  @ApiCreateResponses(PreviewDocumentResponseDto, 'Preview')
  @ApiNotFoundError('Template')
  async preview(
    @Body() dto: PreviewDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PreviewDocumentResponseDto> {
    return this.documentsService.preview(dto, user);
  }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate and save document',
    description:
      'Generate and permanently save a document to tenant storage. ' +
      'Supports generating multiple formats (DOCX, PDF) in a single request. ' +
      'The document is saved to the documents table and storage, with download URLs valid for 15 minutes. ' +
      'Subject to plan-based document limits. Requires admin or member role.',
  })
  @ApiCreateResponses(GenerateDocumentResponseDto, 'Document')
  @ApiNotFoundError('Template')
  @ApiForbiddenError('Document limit exceeded for current plan')
  async generate(
    @Body() dto: GenerateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto> {
    return this.documentsService.generate(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List documents',
    description:
      "Retrieve a paginated list of documents for the authenticated user's tenant. " +
      'By default, soft-deleted documents are hidden. Admins can use the includeDeleted query parameter to view deleted documents. ' +
      'Supports filtering by template key and searching by title.',
  })
  @ApiListResponses(DocumentListResponseDto, 'Documents')
  async list(
    @Query() query: ListDocumentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentListResponseDto> {
    return this.documentsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get document by ID',
    description:
      'Retrieve a single document with full details including metadata, template information, and download URLs. ' +
      'Download URLs are signed and temporary (15 minutes expiry). ' +
      'Soft-deleted documents are accessible if the user has the document ID (for audit trail purposes).',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiGetResponses(DocumentResponseDto, 'Document')
  @ApiForbiddenError('Document belongs to different tenant')
  async findOne(
    @Param() params: DocumentIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(params.id, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete document',
    description:
      'Soft-delete a document by setting the deletedAt timestamp and deletedBy user ID. ' +
      'This operation does NOT delete files from S3 storage (for audit and legal compliance). ' +
      'Deleted documents remain queryable by ID but are hidden from lists (unless admin uses includeDeleted=true). ' +
      'Only admin users can delete documents.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiDeleteResponses('Document')
  @ApiConflictError('Document already deleted')
  async remove(
    @Param() params: DocumentIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeleteDocumentResponseDto> {
    return this.documentsService.remove(params.id, user);
  }
}
