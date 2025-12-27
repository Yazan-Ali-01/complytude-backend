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
      const existing = await this.categoryRepository.findByCode(
        createCategoryDto.code,
      );

      if (existing) {
        throw new ConflictException(
          `Category with code "${createCategoryDto.code}" already exists`,
        );
      }

      const category =
        await this.categoryRepository.createCategory(createCategoryDto);

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

  async findAll(activeOnly?: string): Promise<Category[]> {
    try {
      return this.categoryRepository.findAllCategories(activeOnly);
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
      const category = await this.categoryRepository.findByCode(code);

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

      const category = await this.categoryRepository.updateCategory(
        id,
        updateCategoryDto,
      );

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
