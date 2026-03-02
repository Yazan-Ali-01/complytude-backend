import { OffsetPaginationOptions, OffsetPaginationResult } from '@lib/database';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryRepository,
  CategoryFilters,
} from '../../repositories/categories/category.repository';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    try {
      const existing = await this.categoryRepository.findOne({
        filters: { code: createCategoryDto.code.toLowerCase() },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          `Category with code "${createCategoryDto.code}" already exists`,
        );
      }

      const category = await this.categoryRepository.create(createCategoryDto);

      this.logger.log(`Created category: ${category.code}`);
      return category;
    } catch (error) {
      this.handleError(error, 'create category');
    }
  }

  async findAll(
    filters: CategoryFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
  ): Promise<OffsetPaginationResult<Category>> {
    try {
      return await this.categoryRepository.findMany(filters, pagination);
    } catch (error) {
      this.handleError(error, 'list categories');
    }
  }

  async findById(id: string): Promise<Category> {
    try {
      const category = await this.categoryRepository.findById(id);

      if (!category) {
        throw new NotFoundException(`Category with ID "${id}" not found`);
      }

      return category;
    } catch (error) {
      this.handleError(error, `find category "${id}"`);
    }
  }

  async findByCode(code: string): Promise<Category> {
    try {
      const category = await this.categoryRepository.findOne({
        filters: { code: code.toLowerCase() },
        select: [
          'id',
          'code',
          'name',
          'description',
          'parent_id',
          'is_active',
          'created_at',
          'updated_at',
        ],
      });

      if (!category) {
        throw new NotFoundException(`Category with code "${code}" not found`);
      }

      return category;
    } catch (error) {
      this.handleError(error, `find category by code "${code}"`);
    }
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    try {
      await this.findById(id);

      const category = await this.categoryRepository.update(id, {
        ...updateCategoryDto,
        updated_at: new Date(),
      });

      this.logger.log(`Updated category: ${id}`);
      return category;
    } catch (error) {
      this.handleError(error, `update category "${id}"`);
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      const result = await this.categoryRepository.deactivate(id);
      if (!result) {
        throw new NotFoundException(`Category with ID "${id}" not found`);
      }

      this.logger.log(`Deactivated category: ${id}`);
    } catch (error) {
      this.handleError(error, `deactivate category "${id}"`);
    }
  }

  private handleError(error: unknown, context: string): never {
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Failed to ${context}: ${message}`);
    throw new InternalServerErrorException(`Failed to ${context}`);
  }
}
