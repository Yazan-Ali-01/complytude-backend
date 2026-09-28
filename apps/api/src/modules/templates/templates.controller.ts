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
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { Audit } from 'src/common/decorators/audit.decorator';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import {
  MessageResponseDto,
  PaginationMetaDto,
  PaginationQueryDto,
} from 'src/common/dto';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { FastifyMultipartInterceptor } from 'src/common/interceptors/fastify-multipart.interceptor';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiConflictError,
  ApiCreateResponses,
  ApiDeleteResponses,
  ApiGetResponses,
  ApiListResponses,
  ApiNotFoundError,
  ApiProtectedResponses,
} from 'src/common/swagger/decorators';
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from 'src/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { TemplatesI18n } from './constants/i18n.constants';
import {
  CreateTemplateDto,
  CreateTemplateResponseDto,
  CreateTemplateVersionDto,
  CreateTemplateVersionResponseDto,
  GetTemplateResponseDto,
  GetTemplateVersionResponseDto,
  LinkRulesetsDto,
  LinkRulesetsResponseDto,
  ListTemplatesQueryDto,
  ListTemplatesResponseDto,
  RollbackVersionDto,
  TemplateDownloadQueryDto,
  TemplateDownloadResponseDto,
  TemplateKeyParamDto,
  TemplateUploadValidationDto,
  TemplateVersionParamDto,
  TemplateVersionsListResponseDto,
} from './dto';
import { TemplateFieldItemDto } from './dto/template-field.dto';
import { TemplateVersion } from './entities/template-version.entity';
import { Template } from './entities/template.entity';
import { PlaceholderValidationResult } from './services/docx-placeholder-extraction.service';
import { TemplatesService } from './templates.service';

/**
 * Reads are open to any signed-in user (the template library a tenant generates from); writes
 * need the platform permission templates:manage.
 */
@ApiTags('Templates')
@Controller('templates')
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiExtraModels(
  GetTemplateResponseDto,
  CreateTemplateResponseDto,
  ListTemplatesResponseDto,
  GetTemplateVersionResponseDto,
  CreateTemplateVersionResponseDto,
  TemplateUploadValidationDto,
  TemplateVersionsListResponseDto,
  TemplateDownloadResponseDto,
  LinkRulesetsResponseDto,
  PaginationMetaDto,
)
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly i18n: I18nService,
  ) {}

  // ─── Read Endpoints (identity token, no permission check) ──────

  @Get()
  @ApiOperation({
    summary: 'List all templates',
    description:
      'Retrieve a paginated list of document templates with optional filtering by status, category, authority, and search term.',
  })
  @ApiListResponses(ListTemplatesResponseDto, 'Templates')
  async list(
    @Query() query: ListTemplatesQueryDto,
  ): Promise<ListTemplatesResponseDto> {
    const result = await this.templatesService.findAll(
      {
        status: query.status,
        categoryId: query.categoryId,
        authorityId: query.authorityId,
        search: query.search,
      },
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    );

    return {
      data: result.data.map((template) => this.mapTemplate(template)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
      },
    };
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get template by key',
    description:
      'Retrieve detailed information about a specific template by its unique key. Includes populated current version data.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiGetResponses(GetTemplateResponseDto, 'Template')
  async findOne(
    @Param() params: TemplateKeyParamDto,
  ): Promise<GetTemplateResponseDto> {
    const template = await this.templatesService.findByKeyWithDetails(
      params.key,
    );
    return this.mapTemplate(template, template.current_version_details);
  }

  @Get(':key/versions')
  @ApiOperation({
    summary: 'List template versions',
    description:
      'Retrieve a paginated list of versions for a specific template. Versions are returned in descending order by creation date.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiListResponses(TemplateVersionsListResponseDto, 'Template versions')
  async listVersions(
    @Param() params: TemplateKeyParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<TemplateVersionsListResponseDto> {
    const result = await this.templatesService.listVersions(params.key, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      data: result.data.map((version) => this.mapVersion(version)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
      },
    };
  }

  @Get(':key/versions/:version')
  @ApiOperation({
    summary: 'Get specific template version',
    description:
      'Retrieve detailed information about a specific version of a template, including all fields.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiParam({
    name: 'version',
    description: 'Version number (semantic versioning)',
    example: '1.0.0',
  })
  @ApiGetResponses(GetTemplateVersionResponseDto, 'Template version')
  async findVersion(
    @Param() params: TemplateVersionParamDto,
  ): Promise<GetTemplateVersionResponseDto> {
    return this.mapVersion(
      await this.templatesService.getVersionByKey(params.key, params.version),
    );
  }

  @Get(':key/download')
  @ApiOperation({
    summary: 'Download template file',
    description:
      'Get a pre-signed URL to download the template DOCX file. Returns URL for specified version or current version if not specified. The signed URL expires after 15 minutes.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiGetResponses(TemplateDownloadResponseDto, 'Template download URL')
  download(
    @Param() params: TemplateKeyParamDto,
    @Query() query: TemplateDownloadQueryDto,
  ): Promise<TemplateDownloadResponseDto> {
    return this.templatesService.getDownloadUrl(params.key, query.version);
  }

  // ─── Write Endpoints (identity token + templates:manage) ───────

  @Post()
  @Audit('TEMPLATE_CREATED', { resourceType: 'templates', includeBody: true })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @UseInterceptors(FastifyMultipartInterceptor(CreateTemplateDto))
  @ApiOperation({
    summary: 'Create new template',
    description:
      'Create a new document template with DOCX file upload. This endpoint is restricted to system administrators only. The template will be created with an initial version (1.0.0 unless given) based on the provided file and field definitions.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreateResponses(CreateTemplateResponseDto, 'Template')
  @ApiConflictError('Template with this key already exists')
  async create(
    @Body() dto: CreateTemplateDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<CreateTemplateResponseDto> {
    const created = await this.templatesService.create(dto, identity.userId);
    return {
      ...this.mapTemplate(created, created.current_version_details),
      placeholdersDetected: created.placeholders_detected ?? [],
      validation: this.mapValidation(created.validation),
    };
  }

  @Delete(':key')
  @Audit('TEMPLATE_DEACTIVATED', {
    resourceIdParam: 'key',
    resourceType: 'templates',
  })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Deactivate template',
    description:
      'Soft delete a template by setting its status to inactive. This endpoint is restricted to system administrators only. The template will remain in the database but will be marked as inactive, and can no longer be generated from.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiDeleteResponses('Template')
  async remove(
    @Param() params: TemplateKeyParamDto,
  ): Promise<MessageResponseDto> {
    await this.templatesService.deactivate(params.key);
    return {
      message: this.i18n.t(TemplatesI18n.messages.TEMPLATE_DEACTIVATED),
    };
  }

  @Post(':key/activate')
  @HttpCode(HttpStatus.OK)
  @Audit('TEMPLATE_ACTIVATED', {
    resourceIdParam: 'key',
    resourceType: 'templates',
  })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Activate template',
    description:
      'Set a template (draft, inactive or deprecated) back to active so tenants can generate from it. Restricted to system administrators.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiGetResponses(GetTemplateResponseDto, 'Template')
  @ApiProtectedResponses('System admin only')
  async activate(
    @Param() params: TemplateKeyParamDto,
  ): Promise<GetTemplateResponseDto> {
    return this.mapTemplate(await this.templatesService.activate(params.key));
  }

  @Post(':key/versions')
  @Audit('TEMPLATE_VERSION_CREATED', {
    resourceIdParam: 'key',
    resourceType: 'templates',
  })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @UseInterceptors(FastifyMultipartInterceptor(CreateTemplateVersionDto))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create new template version',
    description:
      'Create a new immutable version of a template with DOCX file upload. This endpoint is restricted to system administrators only. The new version becomes the current one. The version number must follow semantic versioning (x.y.z).',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiCreateResponses(CreateTemplateVersionResponseDto, 'Template version')
  @ApiConflictError('Version already exists for this template')
  async createVersion(
    @Param() params: TemplateKeyParamDto,
    @Body() dto: CreateTemplateVersionDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<CreateTemplateVersionResponseDto> {
    const { version, placeholders, validation } =
      await this.templatesService.createVersion(
        params.key,
        dto,
        identity.userId,
      );
    const mapped = this.mapVersion(version);
    return {
      id: mapped.id,
      templateId: mapped.templateId,
      version: mapped.version,
      fileUrl: mapped.fileUrl,
      isActive: mapped.isActive,
      changelog: mapped.changelog,
      fields: mapped.fields,
      createdAt: mapped.createdAt,
      placeholdersDetected: placeholders,
      validation: this.mapValidation(validation),
    };
  }

  @Post(':key/versions/:version/rollback')
  @Audit('TEMPLATE_VERSION_ROLLBACK', {
    resourceIdParam: 'key',
    resourceType: 'templates',
  })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Rollback to previous template version',
    description:
      'Create a new template version based on a previous version. This endpoint is restricted to system administrators only. The new version will be created with a higher version number and will contain the same content as the specified old version.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiParam({
    name: 'version',
    description: 'Version number to rollback from (semantic versioning)',
    example: '1.0.0',
  })
  @ApiCreateResponses(
    GetTemplateVersionResponseDto,
    'New template version created from rollback',
  )
  @ApiConflictError('New version number already exists')
  async rollback(
    @Param() params: TemplateVersionParamDto,
    @Body() dto: RollbackVersionDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<GetTemplateVersionResponseDto> {
    return this.mapVersion(
      await this.templatesService.rollback(
        params.key,
        params.version,
        dto.newVersion,
        dto.changelog,
        identity.userId,
      ),
    );
  }

  @Post(':key/rulesets')
  @HttpCode(HttpStatus.OK)
  @Audit('TEMPLATE_RULESETS_LINKED', {
    resourceIdParam: 'key',
    resourceType: 'templates',
  })
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('templates:manage')
  @ApiOperation({
    summary: 'Link rulesets to template',
    description:
      'Associate one or more active rulesets with a template. This endpoint is restricted to system administrators only. Rulesets already linked stay linked.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiResponse({
    status: 200,
    description: 'Rulesets linked successfully',
    type: LinkRulesetsResponseDto,
  })
  @ApiNotFoundError('Template or one or more rulesets')
  @ApiProtectedResponses('System admin only')
  async linkRulesets(
    @Param() params: TemplateKeyParamDto,
    @Body() dto: LinkRulesetsDto,
  ): Promise<LinkRulesetsResponseDto> {
    const rulesetKeys = await this.templatesService.linkRulesets(
      params.key,
      dto.rulesetKeys,
    );
    return {
      message: this.i18n.t(TemplatesI18n.messages.RULESETS_LINKED),
      linkedCount: rulesetKeys.length,
      rulesetKeys,
    };
  }

  // ─── Mappers ────────────────────────────────────────────────────

  private mapTemplate(
    template: Template,
    currentVersion?: TemplateVersion | null,
  ): GetTemplateResponseDto {
    return {
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description,
      categoryId: template.category_id,
      authorityId: template.authority_id,
      languages: template.languages,
      currentVersion: template.current_version,
      ...(currentVersion !== undefined && {
        currentVersionData: currentVersion
          ? this.mapVersion(currentVersion)
          : null,
      }),
      status: template.status,
      tier: template.tier,
      fileUrl: template.file_url,
      createdBy: template.created_by,
      createdAt: new Date(template.created_at).toISOString(),
      updatedAt: new Date(template.updated_at).toISOString(),
    };
  }

  private mapVersion(version: TemplateVersion): GetTemplateVersionResponseDto {
    return {
      id: version.id,
      templateId: version.template_id,
      version: version.version,
      fields: version.fields as unknown as TemplateFieldItemDto[],
      fileUrl: version.file_url,
      changelog: version.changelog,
      isActive: version.is_active,
      createdBy: version.created_by,
      createdAt: new Date(version.created_at).toISOString(),
    };
  }

  private mapValidation(
    validation: PlaceholderValidationResult | undefined,
  ): TemplateUploadValidationDto {
    const missingInFields = validation?.unmatchedPlaceholders ?? [];
    const missingInTemplate = validation?.unusedFields ?? [];
    return {
      isValid: missingInFields.length === 0 && missingInTemplate.length === 0,
      missingInFields,
      missingInTemplate,
      matches: validation?.matched ?? [],
    };
  }
}
