import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Category } from './entities/category.entity';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';
import { CategoryRepository } from '../../repositories/categories/category.repository';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    try {
      // Check if code already exists
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
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create category: ${error.message}`);
      throw new InternalServerErrorException('Failed to create category');
    }
  }

  async findAll(active?: boolean): Promise<Category[]> {
    try {
      const filters = active !== undefined ? { is_active: active } : {};
      const result = await this.categoryRepository.findMany(
        filters,
        { page: 1, limit: 1000 },
        'name',
      );
      return result.data;
    } catch (error) {
      this.logger.error(`Failed to fetch categories: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch categories');
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
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch category: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch category');
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
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch category: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch category');
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
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update category: ${error.message}`);
      throw new InternalServerErrorException('Failed to update category');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findById(id);

      await this.categoryRepository.delete(id);

      this.logger.log(`Deleted category: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete category: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete category');
    }
  }
}
