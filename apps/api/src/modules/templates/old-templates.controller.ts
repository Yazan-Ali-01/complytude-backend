import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { DocumentGenerationService } from 'src/modules/templates/services/document-generation.service';
import { RequireAnyPlatformPermission } from '../../common/decorators/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/guards/platform-permissions.guard';
import { FastifyMultipartInterceptor } from '../../common/interceptors/fastify-multipart.interceptor';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateTemplateVersionDto,
  CreateTemplateVersionResponseDto,
  ListTemplatesResponseDto,
  TemplateDownloadResponseDto,
} from './dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import {
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
} from './dto/generate-document.dto';
import {
  GetTemplateResponseDto,
  GetTemplateVersionResponseDto,
} from './dto/template-response.dto';
import { TemplateVersion } from './entities/template-version.entity';
import { Template, TemplateWithDetails } from './entities/template.entity';
import { TemplateVersionsService } from './template-versions.service';
import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@Controller('templates')
@SwaggerCookieAuth.tenantAccessToken()
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly documentGenerationService: DocumentGenerationService,
  ) {}

  @Post()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @UseInterceptors(FastifyMultipartInterceptor(CreateTemplateDto))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create new template',
    description:
      'Create a new document template with metadata and field definitions. Requires DOCX file upload via multipart/form-data (system admin only)',
  })
  @ApiBody({
    description:
      'Template data as multipart/form-data. Fields array should be JSON stringified. File upload is required.',
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', example: 'nda_v1' },
        name: { type: 'string', example: 'Non-Disclosure Agreement' },
        description: { type: 'string', example: 'Standard NDA template' },
        category_id: { type: 'string', format: 'uuid' },
        authority_id: { type: 'string', format: 'uuid' },
        languages: {
          type: 'string',
          example: '["en","ar"]',
          description: 'JSON stringified array',
        },
        fields: {
          type: 'string',
          example:
            '[{"key":"employee_name","label":"Employee Name","type":"text","required":true}]',
          description: 'JSON stringified array of field definitions',
        },
        ruleset_keys: {
          type: 'string',
          example: '["dmcc_employment_rules_v1"]',
          description: 'JSON stringified array (optional)',
        },
        version: { type: 'string', example: '1.0.0' },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'draft', 'deprecated'],
        },
        metadata: { type: 'string', example: '{"tags":["employment"]}' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'DOCX template file (required, max 5MB)',
        },
      },
      required: ['key', 'name', 'languages', 'fields', 'file'],
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Template created successfully with placeholder extraction results',
    schema: {
      allOf: [
        { $ref: '#/components/schemas/GetTemplateResponseDto' },
        {
          type: 'object',
          properties: {
            placeholders_detected: {
              type: 'array',
              items: { type: 'string' },
              example: ['employee_name', 'salary', 'start_date'],
            },
            validation: {
              type: 'object',
              properties: {
                matched: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['employee_name', 'salary'],
                },
                warnings: {
                  type: 'array',
                  items: { type: 'string' },
                  example: [
                    'Placeholder {start_date} found in DOCX but no field definition provided.',
                  ],
                },
                unmatchedPlaceholders: {
                  type: 'array',
                  items: { type: 'string' },
                },
                unusedFields: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Template with this key already exists',
  })
  @ApiResponse({
    status: 422,
    description: 'Invalid file format or file too large',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async create(
    @Body() createTemplateDto: CreateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TemplateWithDetails> {
    return this.templatesService.create(createTemplateDto, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List all templates',
    description: 'Get paginated list of templates with optional filters',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category UUID',
  })
  @ApiQuery({
    name: 'authorityId',
    required: false,
    description: 'Filter by authority UUID',
  })
  @ApiQuery({
    name: 'language',
    required: false,
    description: 'Filter by language code',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 50)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['forward', 'backward'],
    description: 'Pagination direction (default: forward)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of templates',
    type: ListTemplatesResponseDto,
  })
  async findAll(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('authorityId') authorityId?: string,
    @Query('language') language?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<any> {
    return this.templatesService.findAll(
      status,
      categoryId,
      authorityId,
      language,
      {
        cursor,
        limit,
        direction,
      },
    );
  }

  @Get('active')
  @ApiOperation({
    summary: 'List active templates',
    description: 'Get all active templates (shortcut for status=active)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of active templates',
    type: [GetTemplateResponseDto],
  })
  async findActive(): Promise<Template[]> {
    return this.templatesService.findActiveTemplates();
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get template by key',
    description:
      'Get detailed template information including current version, category, authority, and rulesets',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({
    status: 200,
    description: 'Template details',
    type: GetTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findByKey(@Param('key') key: string): Promise<TemplateWithDetails> {
    return this.templatesService.findByKeyWithDetails(key);
  }

  @Get(':key/download')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Download template file',
    description:
      'Get a signed URL to download the template DOCX file. Returns URL for specified version or current version if not specified.',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiQuery({
    name: 'version',
    required: false,
    description: 'Version number (defaults to current version)',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed download URL',
    type: TemplateDownloadResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async downloadTemplate(
    @Param('key') key: string,
    @Query('version') version?: string,
  ): Promise<TemplateDownloadResponseDto> {
    return this.templatesService.getDownloadUrl(key, version);
  }

  @Get(':key/versions')
  @ApiOperation({
    summary: 'Get template version history',
    description: 'Get all versions of a template',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['forward', 'backward'],
    description: 'Pagination direction (default: forward)',
  })
  @ApiResponse({
    status: 200,
    description: 'Template version history',
    type: [GetTemplateVersionResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getVersionHistory(
    @Param('key') key: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<any> {
    const template = await this.templatesService.findByKey(key);
    return this.templateVersionsService.getVersionHistory(template.id, {
      cursor,
      limit,
      direction,
    });
  }

  @Post(':key/versions')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @UseInterceptors(FastifyMultipartInterceptor(CreateTemplateDto))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create new template version',
    description:
      'Upload a new version of a template with DOCX file (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiBody({
    description:
      'Version data as multipart/form-data. Fields array should be JSON stringified.',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.1.0' },
        changelog: { type: 'string', example: 'Added remote work clause' },
        fields: {
          type: 'string',
          example:
            '[{"key":"employee_name","label":"Employee Name","type":"text","required":true}]',
          description: 'JSON stringified array of field definitions',
        },
        metadata: {
          type: 'string',
          example: '{"tags":["employment"]}',
          description: 'JSON stringified object (optional)',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'DOCX template file (required, max 5MB)',
        },
      },
      required: ['version', 'fields', 'file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Template version created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        template_id: { type: 'string', format: 'uuid' },
        version: { type: 'string', example: '1.1.0' },
        file_url: { type: 'string' },
        is_active: { type: 'boolean' },
        changelog: { type: 'string' },
        placeholders_detected: {
          type: 'array',
          items: { type: 'string' },
        },
        validation: {
          type: 'object',
          properties: {
            matched: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 409, description: 'Version already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async createVersion(
    @Param('key') key: string,
    @Body() createVersionDto: CreateTemplateVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CreateTemplateVersionResponseDto> {
    return this.templatesService.createVersion(
      key,
      createVersionDto,
      user.userId,
    );
  }

  @Get(':key/versions/:version')
  @ApiOperation({
    summary: 'Get specific template version',
    description: 'Get details of a specific version of a template',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiParam({ name: 'version', description: 'Version number (e.g., 1.0.0)' })
  @ApiResponse({
    status: 200,
    description: 'Template version details',
    type: GetTemplateVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  async getVersion(
    @Param('key') key: string,
    @Param('version') version: string,
  ): Promise<TemplateVersion> {
    const template = await this.templatesService.findByKey(key);
    return this.templateVersionsService.getVersion(template.id, version);
  }

  @Post(':key/versions/:version/rollback')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rollback template to specific version',
    description:
      'Set a previous version as the current active version (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiParam({ name: 'version', description: 'Version number to rollback to' })
  @ApiResponse({
    status: 200,
    description: 'Template rolled back successfully',
    type: GetTemplateVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async rollback(
    @Param('key') key: string,
    @Param('version') version: string,
  ): Promise<TemplateVersion> {
    const template = await this.templatesService.findByKey(key);
    return this.templateVersionsService.rollback(template.id, version);
  }

  @Put(':key')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Update template',
    description:
      'Update template metadata and/or create new version (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: GetTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async update(
    @Param('key') key: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TemplateWithDetails> {
    return this.templatesService.update(key, updateTemplateDto, user.userId);
  }

  @Delete(':key')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete template',
    description:
      'Permanently delete a template and all its versions (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async delete(@Param('key') key: string): Promise<void> {
    return this.templatesService.delete(key);
  }

  @Post(':key/deactivate')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate template',
    description:
      'Soft delete - set template status to inactive (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({
    status: 200,
    description: 'Template deactivated successfully',
    type: GetTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async deactivate(@Param('key') key: string): Promise<Template> {
    return this.templatesService.deactivate(key);
  }

  @Post(':key/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate document from template',
    description:
      'Generate a Word document (DOCX) from a template by replacing placeholders with provided variables. The generated document is saved to tenant-isolated storage and a download URL is returned.',
  })
  @ApiParam({
    name: 'key',
    description: "Template's unique key",
    example: 'sample-template',
  })
  @ApiBody({
    type: GenerateDocumentDto,
    description: 'Variables to replace in template and optional metadata',
  })
  @ApiResponse({
    status: 200,
    description: 'Document generated successfully',
    type: GenerateDocumentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Invalid variables, missing required fields, or template not active',
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - Document generation failed',
  })
  async generate(
    @Param('key') key: string,
    @Body() generateDocumentDto: GenerateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto> {
    return this.documentGenerationService.generateDocument(
      user.tenantId,
      user.userId,
      key,
      generateDocumentDto,
    );
  }
}
