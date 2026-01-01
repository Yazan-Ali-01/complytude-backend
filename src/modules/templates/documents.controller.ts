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
  ListDocumentsResponseDto,
} from './dto/document-response.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId, SchemaName } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
    type: ListDocumentsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Tenant admins can view all documents; other roles can only view their own.',
  })
  @UseGuards(RolesGuard)
  @Roles('admin', 'member', 'viewer')
  async findAll(
    @TenantId() tenantId: string,
    @SchemaName() schemaName: string,
    @Query(new ValidationPipe({ transform: true })) filters: ListDocumentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListDocumentsResponseDto> {
    return this.documentsService.findAll(tenantId, schemaName, filters, user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get document by ID',
    description:
      'Retrieve a single document with full details including content. Tenant admins can access any document in their tenant; document creators can access their own.',
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
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - Only tenant admins or the document creator can access this document.',
  })
  @UseGuards(RolesGuard)
  @Roles('admin', 'member', 'viewer')
  async findOne(
    @TenantId() tenantId: string,
    @SchemaName() schemaName: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(tenantId, schemaName, id, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete document',
    description: 'Delete a document by ID. Only accessible by tenant admins.',
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
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.documentsService.delete(tenantId, schemaName, id, user.userId);
  }
}
