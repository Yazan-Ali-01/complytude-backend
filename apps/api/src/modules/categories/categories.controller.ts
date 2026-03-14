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
import { AuthOptions } from 'src/modules/auth/decorators/auth-options.decorator';
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
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';
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
@AuthOptions({ identity: true })
@SwaggerCookieAuth.identityAccessToken()
@ApiExtraModels(CategoryResponseDto, CategoryListResponseDto, PaginationMetaDto)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ─── Read Endpoints (identity token, no permission check) ──────

  @Get()
  @ApiOperation({
    summary: 'List all categories',
    description:
      'Retrieve a paginated list of template categories with optional filtering by active status and search term.',
  })
  @ApiListResponses(CategoryListResponseDto, 'Categories')
  async list(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryListResponseDto> {
    const result = await this.categoriesService.findAll(
      {
        isActive: query.isActive,
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
      data: result.data.map((c) => this.mapToResponse(c)),
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
  async findOne(
    @Param() params: CategoryIdParamDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.findById(params.id);
    return this.mapToResponse(category);
  }

  // ─── Write Endpoints (identity token + categories:manage) ──────

  @Post()
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('categories:manage')
  @ApiOperation({
    summary: 'Create category',
    description:
      'Create a new template category. Restricted to platform administrators. The category code will be automatically converted to lowercase.',
  })
  @ApiCreateResponses(CategoryResponseDto, 'Category')
  @ApiConflictError('Category with this code already exists')
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUserIdentity() _identity: AuthenticatedIdentityUser,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.create(dto);
    return this.mapToResponse(category);
  }

  @Patch(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('categories:manage')
  @ApiOperation({
    summary: 'Update category',
    description:
      'Update an existing template category. Restricted to platform administrators. Only provided fields will be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiUpdateResponses(CategoryResponseDto, 'Category')
  async update(
    @Param() params: CategoryIdParamDto,
    @Body() dto: UpdateCategoryDto,
    @CurrentUserIdentity() _identity: AuthenticatedIdentityUser,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.update(params.id, dto);
    return this.mapToResponse(category);
  }

  @Delete(':id')
  @UseGuards(PlatformPermissionsGuard)
  @RequireAnyPlatformPermission('categories:manage')
  @ApiOperation({
    summary: 'Deactivate category',
    description:
      'Soft delete a category by setting its isActive status to false. Restricted to platform administrators.',
  })
  @ApiParam({
    name: 'id',
    description: 'Category UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiDeleteResponses('Category')
  async remove(
    @Param() params: CategoryIdParamDto,
  ): Promise<MessageResponseDto> {
    await this.categoriesService.deactivate(params.id);
    return { message: 'Category has been deactivated' };
  }

  // ─── Response Mapping ──────────────────────────────────────────

  private mapToResponse(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      parentId: category.parent_id,
      isActive: category.is_active,
      createdAt: category.created_at.toISOString(),
      updatedAt: category.updated_at.toISOString(),
    };
  }
}
