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
  ApiExtraModels,
  ApiOperation,
  ApiParam,
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
} from 'src/common/swagger/decorators';
import type { AuthenticatedUser } from 'src/modules/auth/decorators/current-user.decorator';
import { CurrentUser } from 'src/modules/auth/decorators/current-user.decorator';
import {
  CreateRulesetDto,
  CreateRulesetVersionDto,
  ListRulesetsQueryDto,
  RollbackRulesetVersionDto,
  RulesetKeyParamDto,
  RulesetListResponseDto,
  RulesetResponseDto,
  RulesetVersionParamDto,
  RulesetVersionResponseDto,
  RulesetVersionsListResponseDto,
} from './dto';

@ApiTags('Rulesets')
@Controller('rulesets')
@SwaggerCookieAuth.tenantAccessToken()
@ApiExtraModels(
  RulesetResponseDto,
  RulesetListResponseDto,
  RulesetVersionResponseDto,
  RulesetVersionsListResponseDto,
  PaginationMetaDto,
)
export class RulesetsController {
  constructor() {}

  @Get()
  @ApiOperation({
    summary: 'List all rulesets',
    description:
      'Retrieve a paginated list of legal rulesets with optional filtering by status, authority, and search term.',
  })
  @ApiListResponses(RulesetListResponseDto, 'Rulesets')
  list(@Query() _query: ListRulesetsQueryDto): Promise<RulesetListResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get ruleset by key',
    description:
      'Retrieve detailed information about a specific ruleset by its unique key.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiGetResponses(RulesetResponseDto, 'Ruleset')
  findOne(@Param() _params: RulesetKeyParamDto): Promise<RulesetResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new ruleset',
    description:
      'Create a new legal ruleset with clauses. This endpoint is restricted to system administrators only. The ruleset will be created with an initial version (1.0.0) based on the provided clauses.',
  })
  @ApiCreateResponses(RulesetResponseDto, 'Ruleset')
  @ApiConflictError('Ruleset with this key already exists')
  create(
    @Body() _dto: CreateRulesetDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<RulesetResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Delete(':key')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Deactivate ruleset',
    description:
      'Soft delete a ruleset by setting its status to inactive. This endpoint is restricted to system administrators only. The ruleset will remain in the database but will be marked as inactive.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiDeleteResponses('Ruleset')
  remove(
    @Param() _params: RulesetKeyParamDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): MessageResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Get(':key/versions')
  @ApiOperation({
    summary: 'List ruleset versions',
    description:
      'Retrieve a paginated list of versions for a specific ruleset. Versions are returned in descending order by creation date.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiListResponses(RulesetVersionsListResponseDto, 'Ruleset versions')
  listVersions(
    @Param() _params: RulesetKeyParamDto,
    @Query() _query: PaginationQueryDto,
  ): Promise<RulesetVersionsListResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post(':key/versions')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new ruleset version',
    description:
      'Create a new immutable version of a ruleset. This endpoint is restricted to system administrators only. Once created, versions cannot be modified or deleted. The version number must follow semantic versioning (x.y.z).',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiCreateResponses(RulesetVersionResponseDto, 'Ruleset version')
  @ApiConflictError('Version already exists for this ruleset')
  createVersion(
    @Param() _params: RulesetKeyParamDto,
    @Body() _dto: CreateRulesetVersionDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<RulesetVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Get(':key/versions/:version')
  @ApiOperation({
    summary: 'Get specific ruleset version',
    description:
      'Retrieve detailed information about a specific version of a ruleset, including all clauses and metadata.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiParam({
    name: 'version',
    description: 'Version number (semantic versioning)',
    example: '1.0.0',
  })
  @ApiGetResponses(RulesetVersionResponseDto, 'Ruleset version')
  findVersion(
    @Param() _params: RulesetVersionParamDto,
  ): Promise<RulesetVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post(':key/versions/:version/rollback')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Rollback to previous ruleset version',
    description:
      'Create a new ruleset version based on a previous version. This endpoint is restricted to system administrators only. The new version will be created with a higher version number and will contain the same clauses as the specified old version.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiParam({
    name: 'version',
    description: 'Version number to rollback from (semantic versioning)',
    example: '1.0.0',
  })
  @ApiCreateResponses(
    RulesetVersionResponseDto,
    'New ruleset version created from rollback',
  )
  @ApiConflictError('New version number already exists')
  rollback(
    @Param() _params: RulesetVersionParamDto,
    @Body() _dto: RollbackRulesetVersionDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<RulesetVersionResponseDto> {
    // Implementation will be added by service layer
    return null as any;
  }
}
