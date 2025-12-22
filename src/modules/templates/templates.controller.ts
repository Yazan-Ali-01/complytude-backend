import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { TemplateVersionsService } from './template-versions.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import {
  TemplateResponseDto,
  TemplateListResponseDto,
  TemplateVersionResponseDto,
} from './dto/template-response.dto';
import {
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
} from './dto/generate-document.dto';
import {
  Template,
  TemplateWithDetails,
} from 'src/modules/templates/entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/modules/auth/decorators/current-user.decorator';
import { DocumentGenerationService } from './services/document-generation.service';

@ApiTags('Templates')
@Controller('templates')
@ApiBearerAuth()
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
    // DocumentGenerationService will be injected here once created
    private readonly documentGenerationService: DocumentGenerationService,
  ) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new template',
    description:
      'Create a new document template with metadata and field definitions (system admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Template created successfully',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Template with this key already exists',
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
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of templates',
    type: TemplateListResponseDto,
  })
  async findAll(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('authorityId') authorityId?: string,
    @Query('language') language?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ): Promise<TemplateListResponseDto> {
    return this.templatesService.findAll(
      status,
      categoryId,
      authorityId,
      language,
      page,
      limit,
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
    type: [TemplateResponseDto],
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
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findByKey(@Param('key') key: string): Promise<TemplateWithDetails> {
    return this.templatesService.findByKeyWithDetails(key);
  }

  @Get(':key/versions')
  @ApiOperation({
    summary: 'Get template version history',
    description: 'Get all versions of a template',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({
    status: 200,
    description: 'Template version history',
    type: [TemplateVersionResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getVersionHistory(
    @Param('key') key: string,
  ): Promise<TemplateVersion[]> {
    const template = await this.templatesService.findByKey(key);
    return this.templateVersionsService.getVersionHistory(template.id);
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
    type: TemplateVersionResponseDto,
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
  @UseGuards(SystemAdminGuard)
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
    type: TemplateVersionResponseDto,
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
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update template',
    description:
      'Update template metadata and/or create new version (system admin only)',
  })
  @ApiParam({ name: 'key', description: 'Template unique key' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: TemplateResponseDto,
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
  @UseGuards(SystemAdminGuard)
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
  @UseGuards(SystemAdminGuard)
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
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async deactivate(@Param('key') key: string): Promise<Template> {
    return this.templatesService.deactivate(key);
  }

  @Post(':id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate document from template',
    description:
      'Generate a Word document (DOCX) from a template by replacing placeholders with provided variables. The generated document is saved to tenant-isolated storage and a download URL is returned.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'dmcc_employment_v1',
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
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() generateDocumentDto: GenerateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto | null> {
    return this.documentGenerationService.generateDocument(
      user.tenantId,
      user.userId,
      id,
      generateDocumentDto,
    );
  }
}
