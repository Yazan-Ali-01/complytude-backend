import { OffsetPaginationOptions, OffsetPaginationResult } from '@lib/database';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  CategoryFilters,
  CategoryRepository,
} from '../../repositories/categories/category.repository';
import { CategoriesI18n } from './constants/i18n.constants';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly i18n: I18nService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    try {
      const existing = await this.categoryRepository.findOne({
        filters: { code: createCategoryDto.code.toLowerCase() },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          this.i18n.t(CategoriesI18n.errors.CATEGORY_ALREADY_EXISTS, {
            args: { code: createCategoryDto.code },
          }),
        );
      }

      const category = await this.categoryRepository.create({
        code: createCategoryDto.code,
        name: createCategoryDto.name,
        description: createCategoryDto.description ?? null,
        parent_id: createCategoryDto.parentId ?? null,
        is_active: createCategoryDto.isActive,
      });

      this.logger.log(`Created category: ${category.code}`);
      return category;
    } catch (error) {
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORY_CREATE_FAILED,
        'create category',
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
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORIES_FETCH_FAILED,
        'list categories',
      );
    }
  }

  async findById(id: string): Promise<Category> {
    try {
      const category = await this.categoryRepository.findById(id);

      if (!category) {
        throw new NotFoundException(
          this.i18n.t(CategoriesI18n.errors.CATEGORY_NOT_FOUND_BY_ID, {
            args: { id },
          }),
        );
      }

      return category;
    } catch (error) {
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORY_FETCH_FAILED,
        `find category "${id}"`,
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
          this.i18n.t(CategoriesI18n.errors.CATEGORY_NOT_FOUND_BY_CODE, {
            args: { code },
          }),
        );
      }

      return category;
    } catch (error) {
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORY_FETCH_FAILED,
        `find category by code "${code}"`,
      );
    }
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    try {
      await this.findById(id);

      // Unset fields stay undefined, and the repository leaves those columns alone
      const category = await this.categoryRepository.update(id, {
        name: updateCategoryDto.name,
        description: updateCategoryDto.description,
        parent_id: updateCategoryDto.parentId,
        is_active: updateCategoryDto.isActive,
        updated_at: new Date(),
      });

      this.logger.log(`Updated category: ${id}`);
      return category;
    } catch (error) {
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORY_UPDATE_FAILED,
        `update category "${id}"`,
      );
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      const result = await this.categoryRepository.deactivate(id);
      if (!result) {
        throw new NotFoundException(
          this.i18n.t(CategoriesI18n.errors.CATEGORY_NOT_FOUND_BY_ID, {
            args: { id },
          }),
        );
      }

      this.logger.log(`Deactivated category: ${id}`);
    } catch (error) {
      this.handleError(
        error,
        CategoriesI18n.errors.CATEGORY_DEACTIVATE_FAILED,
        `deactivate category "${id}"`,
      );
    }
  }

  private handleError(error: unknown, i18nKey: string, context: string): never {
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Failed to ${context}: ${message}`);
    throw new InternalServerErrorException(this.i18n.t(i18nKey));
  }
}
