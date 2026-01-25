import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerCookieAuth } from 'src/common/swagger/common';
import { SystemAdminGuard } from '../../common/guards/system-admin.guard';
import { CategoriesService } from './categories.service';

import { CursorPaginationResult } from 'src/repositories/base/repository.interface';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { Category } from './entities/category.entity';

@ApiTags('Categories')
@Controller('categories')
@SwaggerCookieAuth.accessToken()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Create new category',
    description: 'Create a new template category (system admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: Object,
  })
  @ApiResponse({
    status: 409,
    description: 'Category with this code already exists',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all categories',
    description:
      'Get list of all template categories (optionally filter by active status)',
  })
  @ApiQuery({
    name: 'active',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 50)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['forward', 'backward'],
    description: 'Pagination direction (default: forward)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of categories',
    type: [Object],
  })
  async findAll(
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('direction')
    direction?: 'forward' | 'backward',
  ): Promise<CursorPaginationResult<Category>> {
    return this.categoriesService.findAll(active, {
      cursor,
      limit,
      direction,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get category by ID',
    description: 'Get details of a specific category',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category details', type: Object })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findById(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findById(id);
  }

  @Put(':id')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({
    summary: 'Update category',
    description: 'Update an existing category (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete category',
    description: 'Delete a category (system admin only)',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 204, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - System admin only' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
