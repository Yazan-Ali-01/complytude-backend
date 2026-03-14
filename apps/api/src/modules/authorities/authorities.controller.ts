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
import { MessageResponseDto, PaginationMetaDto } from 'src/common/dto';
import { RequireAnyPlatformPermission } from 'src/common/decorators/platform-permissions.decorator';
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
import { CurrentUserIdentity } from 'src/modules/auth/decorators/current-user.decorator';
import { AuthOptions } from '../auth/decorators/auth-options.decorator';
import type { AuthenticatedIdentityUser } from '../auth/strategies';
import { Authority } from './entities/authority.entity';
import { AuthoritiesService } from './authorities.service';
import {
  AuthorityIdParamDto,
  AuthorityListResponseDto,
  AuthorityResponseDto,
  CreateAuthorityDto,
  ListAuthoritiesQueryDto,
  UpdateAuthorityDto,
} from './dto';

@ApiTags('Authorities')
@Controller('authorities')
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiExtraModels(
  AuthorityResponseDto,
  AuthorityListResponseDto,
  PaginationMetaDto,
)
export class AuthoritiesController {
  constructor(private readonly authoritiesService: AuthoritiesService) {}

  // ─── Read Endpoints (identity token, no permission check) ──────

  @Get()
  @ApiOperation({
    summary: 'List all authorities',
    description:
      'Retrieve a paginated list of legal authorities with optional filtering by active status, search term, and country.',
  })
  @ApiListResponses(AuthorityListResponseDto, 'Authorities')
  async list(
    @Query() query: ListAuthoritiesQueryDto,
  ): Promise<AuthorityListResponseDto> {
    const result = await this.authoritiesService.findAll(
      {
        isActive: query.isActive,
        search: query.search,
        country: query.country,
      },
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    );

    return {
      data: result.data.map((a) => this.mapToResponse(a)),
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get authority by ID',
    description:
      'Retrieve detailed information about a specific legal authority by its UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiGetResponses(AuthorityResponseDto, 'Authority')
  async findOne(
    @Param() params: AuthorityIdParamDto,
  ): Promise<AuthorityResponseDto> {
    const authority = await this.authoritiesService.findById(params.id);
    return this.mapToResponse(authority);
  }

  // ─── Write Endpoints (identity token + authorities:manage) ─────

  @Post()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @ApiOperation({
    summary: 'Create authority',
    description:
      'Create a new legal authority. Restricted to platform administrators. The authority code will be automatically converted to uppercase.',
  })
  @ApiCreateResponses(AuthorityResponseDto, 'Authority')
  @ApiConflictError('Authority with this code already exists')
  async create(
    @Body() dto: CreateAuthorityDto,
    @CurrentUserIdentity() _identity: AuthenticatedIdentityUser,
  ): Promise<AuthorityResponseDto> {
    const authority = await this.authoritiesService.create(dto);
    return this.mapToResponse(authority);
  }

  @Patch(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @ApiOperation({
    summary: 'Update authority',
    description:
      'Update an existing legal authority. Restricted to platform administrators. Only provided fields will be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiUpdateResponses(AuthorityResponseDto, 'Authority')
  async update(
    @Param() params: AuthorityIdParamDto,
    @Body() dto: UpdateAuthorityDto,
    @CurrentUserIdentity() _identity: AuthenticatedIdentityUser,
  ): Promise<AuthorityResponseDto> {
    const authority = await this.authoritiesService.update(params.id, dto);
    return this.mapToResponse(authority);
  }

  @Delete(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('authorities:manage')
  @ApiOperation({
    summary: 'Deactivate authority',
    description:
      'Soft delete an authority by setting its isActive status to false. Restricted to platform administrators.',
  })
  @ApiParam({
    name: 'id',
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiDeleteResponses('Authority')
  async remove(
    @Param() params: AuthorityIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.authoritiesService.delete(params.id);
    return { message: 'Authority has been deactivated' };
  }

  // ─── Response Mapping ──────────────────────────────────────────

  private mapToResponse(authority: Authority): AuthorityResponseDto {
    return {
      id: authority.id,
      code: authority.code,
      name: authority.name,
      description: authority.description,
      country: authority.country,
      isActive: authority.is_active,
      createdAt: authority.created_at.toISOString(),
      updatedAt: authority.updated_at.toISOString(),
    };
  }
}
