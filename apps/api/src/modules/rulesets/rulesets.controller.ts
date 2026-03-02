import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
import {
  MessageResponseDto,
  PaginationMetaDto,
  PaginationQueryDto,
} from 'src/common/dto';
import { PlatformPermissionsGuard } from 'src/common/guards/platform-permissions.guard';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import {
  ApiConflictError,
  ApiCreateResponses,
  ApiDeleteResponses,
  ApiGetResponses,
  ApiListResponses,
  ApiUpdateResponses,
} from 'src/common/swagger/decorators';
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
import { CurrentUserIdentity } from 'src/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import {
  CreateRulesetDto,
  CreateRulesetVersionDto,
  ListRulesetsQueryDto,
  RollbackRulesetVersionDto,
  RulesetKeyParamDto,
  RulesetListResponseDto,
  RulesetResponseDto,
  RulesetSummaryResponseDto,
  RulesetVersionParamDto,
  RulesetVersionResponseDto,
  RulesetVersionsListResponseDto,
  UpdateRulesetDto,
} from './dto';
import { RulesetVersion } from './entities/ruleset-version.entity';
import { Ruleset } from './entities/ruleset.entity';
import { RulesetsService, RulesetWithVersion } from './rulesets.service';

@ApiTags('Rulesets')
@Controller('rulesets')
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiExtraModels(
  RulesetSummaryResponseDto,
  RulesetResponseDto,
  RulesetListResponseDto,
  RulesetVersionResponseDto,
  RulesetVersionsListResponseDto,
  PaginationMetaDto,
)
export class RulesetsController {
  constructor(private readonly rulesetsService: RulesetsService) {}

  // ─── Read Endpoints (identity token, no permission check) ──────

  @Get()
  @ApiOperation({
    summary: 'List all rulesets',
    description:
      'Retrieve a paginated list of legal rulesets with optional filtering by status, authority, and search term.',
  })
  @ApiListResponses(RulesetListResponseDto, 'Rulesets')
  async list(
    @Query() query: ListRulesetsQueryDto,
  ): Promise<RulesetListResponseDto> {
    const result = await this.rulesetsService.findAll(
      {
        status: query.status,
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
      data: result.data.map((r) => this.mapRulesetToSummary(r)),
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
    summary: 'Get ruleset by key',
    description:
      'Retrieve detailed information about a specific ruleset including its current version data.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiGetResponses(RulesetResponseDto, 'Ruleset')
  async findOne(
    @Param() params: RulesetKeyParamDto,
  ): Promise<RulesetResponseDto> {
    const result = await this.rulesetsService.findByKey(params.key);
    return this.mapRulesetWithVersionToResponse(result);
  }

  @Get(':key/versions')
  @ApiOperation({
    summary: 'List ruleset versions',
    description:
      'Retrieve a paginated list of versions for a specific ruleset.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiListResponses(RulesetVersionsListResponseDto, 'Ruleset versions')
  async listVersions(
    @Param() params: RulesetKeyParamDto,
    @Query() query: PaginationQueryDto,
  ): Promise<RulesetVersionsListResponseDto> {
    const result = await this.rulesetsService.listVersions(params.key, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      data: result.data.map((v) => this.mapVersionToResponse(v)),
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
    summary: 'Get specific ruleset version',
    description:
      'Retrieve detailed information about a specific version of a ruleset, including all clauses.',
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
  async findVersion(
    @Param() params: RulesetVersionParamDto,
  ): Promise<RulesetVersionResponseDto> {
    const version = await this.rulesetsService.findVersion(
      params.key,
      params.version,
    );
    return this.mapVersionToResponse(version);
  }

  // ─── Write Endpoints (identity token + rulesets:manage) ────────

  @Post()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('rulesets:manage')
  @ApiOperation({
    summary: 'Create new ruleset',
    description:
      'Create a new legal ruleset with an initial version (1.0.0). Restricted to platform administrators.',
  })
  @ApiCreateResponses(RulesetResponseDto, 'Ruleset')
  @ApiConflictError('Ruleset with this key already exists')
  async create(
    @Body() dto: CreateRulesetDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<RulesetResponseDto> {
    const result = await this.rulesetsService.create(dto, identity.userId);
    return this.mapRulesetWithVersionToResponse(result);
  }

  @Patch(':key')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('rulesets:manage')
  @ApiOperation({
    summary: 'Update ruleset metadata',
    description:
      'Update ruleset name, description, authority, status, or metadata. Clauses are immutable per version. Restricted to platform administrators.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiUpdateResponses(RulesetResponseDto, 'Ruleset')
  async update(
    @Param() params: RulesetKeyParamDto,
    @Body() dto: UpdateRulesetDto,
  ): Promise<RulesetResponseDto> {
    const result = await this.rulesetsService.update(params.key, dto);
    return this.mapRulesetWithVersionToResponse(result);
  }

  @Delete(':key')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('rulesets:manage')
  @ApiOperation({
    summary: 'Deactivate ruleset',
    description:
      'Soft delete a ruleset by setting its status to inactive. Restricted to platform administrators.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiDeleteResponses('Ruleset')
  async remove(
    @Param() params: RulesetKeyParamDto,
  ): Promise<MessageResponseDto> {
    await this.rulesetsService.deactivate(params.key);
    return { message: `Ruleset "${params.key}" has been deactivated` };
  }

  @Post(':key/versions')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('rulesets:manage')
  @ApiOperation({
    summary: 'Create new ruleset version',
    description:
      'Create a new immutable version of a ruleset. Versions cannot be modified after creation. Restricted to platform administrators.',
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiCreateResponses(RulesetVersionResponseDto, 'Ruleset version')
  @ApiConflictError('Version already exists for this ruleset')
  async createVersion(
    @Param() params: RulesetKeyParamDto,
    @Body() dto: CreateRulesetVersionDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<RulesetVersionResponseDto> {
    const version = await this.rulesetsService.createVersion(
      params.key,
      dto,
      identity.userId,
    );
    return this.mapVersionToResponse(version);
  }

  @Post(':key/versions/:version/rollback')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('rulesets:manage')
  @ApiOperation({
    summary: 'Rollback to previous ruleset version',
    description:
      "Create a new version based on a previous version's clauses. Restricted to platform administrators.",
  })
  @ApiParam({
    name: 'key',
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @ApiParam({
    name: 'version',
    description: 'Source version to rollback from',
    example: '1.0.0',
  })
  @ApiCreateResponses(
    RulesetVersionResponseDto,
    'New ruleset version created from rollback',
  )
  @ApiConflictError('New version number already exists')
  async rollback(
    @Param() params: RulesetVersionParamDto,
    @Body() dto: RollbackRulesetVersionDto,
    @CurrentUserIdentity() identity: AuthenticatedIdentityUser,
  ): Promise<RulesetVersionResponseDto> {
    const version = await this.rulesetsService.rollbackVersion(
      params.key,
      params.version,
      dto.newVersion,
      dto.changelog,
      identity.userId,
    );
    return this.mapVersionToResponse(version);
  }

  // ─── Response Mapping ──────────────────────────────────────────

  private mapRulesetToSummary(ruleset: Ruleset): RulesetSummaryResponseDto {
    return {
      id: ruleset.id,
      key: ruleset.key,
      name: ruleset.name,
      description: ruleset.description,
      authorityId: ruleset.authorityId,
      currentVersion: ruleset.currentVersion,
      status: ruleset.status,
      metadata: ruleset.metadata,
      createdBy: ruleset.createdBy,
      createdAt: ruleset.createdAt.toISOString(),
      updatedAt: ruleset.updatedAt.toISOString(),
    };
  }

  private mapRulesetWithVersionToResponse(
    result: RulesetWithVersion,
  ): RulesetResponseDto {
    return {
      ...this.mapRulesetToSummary(result.ruleset),
      currentVersionData: this.mapVersionToResponse(result.currentVersionData),
    };
  }

  private mapVersionToResponse(
    version: RulesetVersion,
  ): RulesetVersionResponseDto {
    return {
      id: version.id,
      rulesetId: version.rulesetId,
      version: version.version,
      clauses: version.clauses,
      changelog: version.changelog,
      metadata: version.metadata,
      isActive: version.isActive,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
