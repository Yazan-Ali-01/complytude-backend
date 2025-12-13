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
  ParseUUIDPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
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
import { Template, TemplateWithDetails } from './entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Templates')
@Controller('templates')
@ApiBearerAuth()
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get template by id',
    description:
      'Get detailed template information including current version, category, authority, and rulesets',
  })
  @ApiParam({ name: 'id', description: "Template's unique id" })
  @ApiResponse({
    status: 200,
    description: 'Template details',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateWithDetails> {
    return this.templatesService.findByIdWithDetails(id);
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'Get template version history',
    description: 'Get all versions of a template',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiResponse({
    status: 200,
    description: 'Template version history',
    type: [TemplateVersionResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getVersionHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateVersion[]> {
    const template = await this.templatesService.findById(id);
    return this.templateVersionsService.getVersionHistory(template.id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({
    summary: 'Get specific template version',
    description: 'Get details of a specific version of a template',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiParam({ name: 'version', description: 'Version number (e.g., 1.0.0)' })
  @ApiResponse({
    status: 200,
    description: 'Template version details',
    type: TemplateVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  async getVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
  ): Promise<TemplateVersion> {
    const template = await this.templatesService.findById(id);
    return this.templateVersionsService.getVersion(template.id, version);
  }

  @Post(':id/versions/:version/rollback')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rollback template to specific version',
    description:
      'Set a previous version as the current active version (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiParam({ name: 'version', description: 'Version number to rollback to' })
  @ApiResponse({
    status: 200,
    description: 'Template rolled back successfully',
    type: TemplateVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async rollback(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
  ): Promise<TemplateVersion> {
    const template = await this.templatesService.findById(id);
    return this.templateVersionsService.rollback(template.id, version);
  }

  @Put(':id')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update template',
    description:
      'Update template metadata and/or create new version (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TemplateWithDetails> {
    return this.templatesService.update(id, updateTemplateDto, user.userId);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete template',
    description:
      'Permanently delete a template and all its versions (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templatesService.delete(id);
  }

  @Post(':id/deactivate')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate template',
    description:
      'Soft delete - set template status to inactive (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Template unique id' })
  @ApiResponse({
    status: 200,
    description: 'Template deactivated successfully',
    type: TemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Template> {
    return this.templatesService.deactivate(id);
  }
}
