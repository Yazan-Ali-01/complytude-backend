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
import { SystemAdminGuard } from 'src/common/guards/system-admin.guard';
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
@SwaggerCookieAuth.tenantAccessToken()
@ApiExtraModels(
  AuthorityResponseDto,
  AuthorityListResponseDto,
  PaginationMetaDto,
)
export class AuthoritiesController {
  constructor() {}

  @Get()
  @ApiOperation({
    summary: 'List all authorities',
    description:
      'Retrieve a paginated list of legal authorities with optional filtering by active status, search term, and country.',
  })
  @ApiListResponses(AuthorityListResponseDto, 'Authorities')
  list(@Query() _query: ListAuthoritiesQueryDto): AuthorityListResponseDto {
    // Implementation will be added by service layer
    return null as any;
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
  findOne(@Param() _params: AuthorityIdParamDto): AuthorityResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post()
  @AuthOptions({ identity: true })
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create authority',
    description:
      'Create a new legal authority. This endpoint is restricted to system administrators only. The authority code will be automatically converted to uppercase.',
  })
  @ApiCreateResponses(AuthorityResponseDto, 'Authority')
  @ApiConflictError('Authority with this code already exists')
  create(
    @Body() _dto: CreateAuthorityDto,
    @CurrentUserIdentity() _identityUser: AuthenticatedIdentityUser,
  ): AuthorityResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Patch(':id')
  @AuthOptions({ identity: true })
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update authority',
    description:
      'Update an existing legal authority. This endpoint is restricted to system administrators only. Only provided fields will be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiUpdateResponses(AuthorityResponseDto, 'Authority')
  update(
    @Param() _params: AuthorityIdParamDto,
    @Body() _dto: UpdateAuthorityDto,
    @CurrentUserIdentity() _identityUser: AuthenticatedIdentityUser,
  ): AuthorityResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Delete(':id')
  @AuthOptions({ identity: true })
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Deactivate authority',
    description:
      'Soft delete an authority by setting its isActive status to false. This endpoint is restricted to system administrators only. The authority will remain in the database but will be marked as inactive.',
  })
  @ApiParam({
    name: 'id',
    description: 'Authority UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiDeleteResponses('Authority')
  remove(
    @Param() _params: AuthorityIdParamDto,
    @CurrentUserIdentity() _identityUser: AuthenticatedIdentityUser,
  ): MessageResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }
}
