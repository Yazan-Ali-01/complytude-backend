import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import {
  DocumentResponseDto,
  DocumentListResponseDto,
} from './dto/document-response.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';
import { TenantId, SchemaName } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List documents',
    description:
      "Get paginated list of generated documents for the authenticated user's tenant. Supports filtering by template key and date range.",
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 50, max: 100)',
    example: 50,
  })
  @ApiQuery({
    name: 'templateKey',
    required: false,
    type: String,
    description: 'Filter by template key',
    example: 'employment_contract',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter by start date (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter by end date (ISO 8601 format)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'List of documents with pagination metadata',
    type: DocumentListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  async findAll(
    @TenantId() tenantId: string,
    @SchemaName() schemaName: string,
    @Query(new ValidationPipe({ transform: true })) filters: ListDocumentsDto,
  ): Promise<DocumentListResponseDto> {
    return this.documentsService.findAll(tenantId, schemaName, filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get document by ID',
    description:
      'Retrieve a single document with full details including content. Only accessible by users within the same tenant.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document ID',
    example: 'doc_123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Document details',
    type: DocumentResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 404,
    description: 'Document not found or does not belong to your tenant',
  })
  async findOne(
    @TenantId() tenantId: string,
    @SchemaName() schemaName: string,
    @Param('id') id: string,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(tenantId, schemaName, id);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete document',
    description:
      'Delete a document by ID. Only accessible by system administrators.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document ID',
    example: 'doc_123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Document deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Document deleted successfully' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'Document not found',
  })
  async delete(
    @TenantId() tenantId: string,
    @SchemaName() schemaName: string,
    @Param('id') id: string,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.documentsService.delete(tenantId, schemaName, id);
    return { message: 'Document deleted successfully' };
  }
}
