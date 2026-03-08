import { OffsetPaginationOptions, OffsetPaginationResult } from '@lib/database';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { CommonI18n } from '../../common/constants';
import {
  CategoryFilters,
  CategoryRepository,
} from '../../repositories/categories/category.repository';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly categoryRepository: CategoryRepository,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    try {
      const existing = await this.categoryRepository.findOne({
        filters: { code: createCategoryDto.code.toLowerCase() },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          this.i18n.t(CommonI18n.errors.CONFLICT) ??
            `Category with code "${createCategoryDto.code}" already exists`,
        );
      }

      const category = await this.categoryRepository.create(createCategoryDto);

      this.logger.log(`Created category: ${category.code}`);
      return category;
    } catch (error) {
      this.handleError(
        error,
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to create category',
      );
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
        throw new NotFoundException(
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Category with ID "${id}" not found`,
        );
      }

      return category;
    } catch (error) {
      this.handleError(
        error,
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to find category',
      );
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
        throw new NotFoundException(
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Category with code "${code}" not found`,
        );
      }

      return category;
    } catch (error) {
      this.handleError(
        error,
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to find category by code',
      );
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
      this.handleError(
        error,
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to update category',
      );
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      const result = await this.categoryRepository.deactivate(id);
      if (!result) {
        throw new NotFoundException(
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Category with ID "${id}" not found`,
        );
      }

      this.logger.log(`Deactivated category: ${id}`);
    } catch (error) {
      this.handleError(
        error,
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to deactivate category',
      );
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
    throw new InternalServerErrorException(
      this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
        `Failed to ${context}`,
    );
  }
}
