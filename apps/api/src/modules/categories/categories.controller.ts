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
import { MessageResponseDto, PaginationMetaDto, SystemAdminGuard } from '@complytude/shared';
import { SwaggerCookieAuth } from '@complytude/shared';
import {
  ApiConflictError,
  ApiCreateResponses,
  ApiDeleteResponses,
  ApiGetResponses,
  ApiListResponses,
  ApiUpdateResponses,
} from '../../common/swagger/decorators';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CategoryIdParamDto,
  CategoryListResponseDto,
  CategoryResponseDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

@ApiTags('Categories')
@Controller('categories')
@SwaggerCookieAuth.accessToken()
@ApiExtraModels(CategoryResponseDto, CategoryListResponseDto, PaginationMetaDto)
export class CategoriesController {
  constructor() {}

  @Get()
  @ApiOperation({
    summary: 'List all categories',
    description:
      'Retrieve a paginated list of template categories with optional filtering by active status and search term.',
  })
  @ApiListResponses(CategoryListResponseDto, 'Categories')
  list(@Query() _query: ListCategoriesQueryDto): CategoryListResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get category by ID',
    description:
      'Retrieve detailed information about a specific template category by its UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiGetResponses(CategoryResponseDto, 'Category')
  findOne(@Param() _params: CategoryIdParamDto): CategoryResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create category',
    description:
      'Create a new template category. This endpoint is restricted to system administrators only. The category code will be automatically converted to lowercase.',
  })
  @ApiCreateResponses(CategoryResponseDto, 'Category')
  @ApiConflictError('Category with this code already exists')
  create(
    @Body() _dto: CreateCategoryDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): CategoryResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Patch(':id')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update category',
    description:
      'Update an existing template category. This endpoint is restricted to system administrators only. Only provided fields will be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiUpdateResponses(CategoryResponseDto, 'Category')
  update(
    @Param() _params: CategoryIdParamDto,
    @Body() _dto: UpdateCategoryDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): CategoryResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Deactivate category',
    description:
      'Soft delete a category by setting its isActive status to false. This endpoint is restricted to system administrators only. The category will remain in the database but will be marked as inactive.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiDeleteResponses('Category')
  remove(
    @Param() _params: CategoryIdParamDto,
    @CurrentUser() _user: AuthenticatedUser,
  ): MessageResponseDto {
    // Implementation will be added by service layer
    return null as any;
  }
}
