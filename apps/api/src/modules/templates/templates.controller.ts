import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  MessageResponseDto,
  PaginationMetaDto,
  PaginationQueryDto,
} from 'src/common/dto';
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
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
import type { AuthenticatedUser } from 'src/modules/auth/decorators/current-user.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import {
  CreateTemplateDto,
  CreateTemplateVersionDto,
  LinkRulesetsDto,
  LinkRulesetsResponseDto,
  ListTemplatesQueryDto,
  RollbackVersionDto,
  TemplateDownloadQueryDto,
  TemplateDownloadResponseDto,
  TemplateKeyParamDto,
  TemplateListResponseDto,
  TemplateResponseDto,
  TemplateVersionParamDto,
  TemplateVersionResponseDto,
  TemplateVersionsListResponseDto,
} from './dto';

@ApiTags('Templates')
@Controller('templates')
@SwaggerCookieAuth.tenantAccessToken()
@ApiExtraModels(
  TemplateResponseDto,
  TemplateListResponseDto,
  TemplateVersionResponseDto,
  TemplateVersionsListResponseDto,
  TemplateDownloadResponseDto,
  LinkRulesetsResponseDto,
  PaginationMetaDto,
)
export class TemplatesController {
  constructor() {}

  @Get()
  @ApiOperation({
    summary: 'List all templates',
    description:
      'Retrieve a paginated list of document templates with optional filtering by status, category, authority, and search term.',
  })
  @ApiListResponses(TemplateListResponseDto, 'Templates')
  list(
    @Query() _query: ListTemplatesQueryDto,
  ): Promise<TemplateListResponseDto> {
    // Implementation will be added by service layer
    return null as any;
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
  @ApiGetResponses(TemplateResponseDto, 'Template')
  findOne(@Param() _params: TemplateKeyParamDto): Promise<TemplateResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new template',
    description:
      'Create a new document template with DOCX file upload. This endpoint is restricted to system administrators only. The template will be created with an initial version (1.0.0) based on the provided file and field definitions.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreateResponses(TemplateResponseDto, 'Template')
  @ApiConflictError('Template with this key already exists')
  create(
    @Body() _dto: CreateTemplateDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<TemplateResponseDto> {
    // Implementation will be added by service layer
    // Note: This will use multipart/form-data in actual implementation
    return null as any;
  }

  @Delete(':key')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Deactivate template',
    description:
      'Soft delete a template by setting its status to inactive. This endpoint is restricted to system administrators only. The template will remain in the database but will be marked as inactive.',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiDeleteResponses('Template')
  remove(
    @Param() _params: TemplateKeyParamDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): MessageResponseDto {
    // Implementation will be added by service layer
    return null as any;
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
  listVersions(
    @Param() _params: TemplateKeyParamDto,
    @Query() _query: PaginationQueryDto,
  ): Promise<TemplateVersionsListResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post(':key/versions')
  @UseGuards(SystemAdminGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create new template version',
    description:
      'Create a new immutable version of a template with DOCX file upload. This endpoint is restricted to system administrators only. Once created, versions cannot be modified or deleted. The version number must follow semantic versioning (x.y.z).',
  })
  @ApiParam({
    name: 'key',
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @ApiCreateResponses(TemplateVersionResponseDto, 'Template version')
  @ApiConflictError('Version already exists for this template')
  createVersion(
    @Param() _params: TemplateKeyParamDto,
    @Body() _dto: CreateTemplateVersionDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<TemplateVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Get(':key/versions/:version')
  @ApiOperation({
    summary: 'Get specific template version',
    description:
      'Retrieve detailed information about a specific version of a template, including all fields and metadata.',
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
  @ApiGetResponses(TemplateVersionResponseDto, 'Template version')
  findVersion(
    @Param() _params: TemplateVersionParamDto,
  ): Promise<TemplateVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post(':key/versions/:version/rollback')
  @UseGuards(SystemAdminGuard)
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
    TemplateVersionResponseDto,
    'New template version created from rollback',
  )
  @ApiConflictError('New version number already exists')
  rollback(
    @Param() _params: TemplateVersionParamDto,
    @Body() _dto: RollbackVersionDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<TemplateVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post(':key/rulesets')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Link rulesets to template',
    description:
      'Associate one or more rulesets with a template. This endpoint is restricted to system administrators only. The rulesets will be linked to the template for compliance checking and document generation.',
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
  linkRulesets(
    @Param() _params: TemplateKeyParamDto,
    @Body() _dto: LinkRulesetsDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<LinkRulesetsResponseDto> {
    // Implementation will be added by service layer
    return null as any;
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
    @Param() _params: TemplateKeyParamDto,
    @Query() _query: TemplateDownloadQueryDto,
  ): Promise<TemplateDownloadResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }
}
