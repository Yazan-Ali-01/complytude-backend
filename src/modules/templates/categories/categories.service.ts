import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from 'src/core/database/database.service';
import { Category } from './entities/category.entity';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    try {
      // Check if code already exists
      const existing = await this.databaseService.query(
        'SELECT id FROM public.categories WHERE code = $1',
        [createCategoryDto.code],
      );

      if (existing.rows.length > 0) {
        throw new ConflictException(
          `Category with code "${createCategoryDto.code}" already exists`,
        );
      }

      const result = await this.databaseService.query<Category>(
        `
        INSERT INTO public.categories (code, name, description, parent_id, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          createCategoryDto.code.toLowerCase(),
          createCategoryDto.name,
          createCategoryDto.description || null,
          createCategoryDto.parent_id || null,
          createCategoryDto.is_active !== undefined
            ? createCategoryDto.is_active
            : true,
        ],
      );

      this.logger.log(`Created category: ${createCategoryDto.code}`);
      return result.rows[0];
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create category: ${error.message}`);
      throw new InternalServerErrorException('Failed to create category');
    }
  }

  async findAll(activeOnly = false): Promise<Category[]> {
    try {
      const query = activeOnly
        ? 'SELECT * FROM public.categories WHERE is_active = true ORDER BY name'
        : 'SELECT * FROM public.categories ORDER BY name';

      const result = await this.databaseService.query<Category>(query);
      return result.rows;
    } catch (error) {
      this.logger.error(`Failed to fetch categories: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch categories');
    }
  }

  async findById(id: string): Promise<Category> {
    try {
      const result = await this.databaseService.query<Category>(
        'SELECT * FROM public.categories WHERE id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Category with ID "${id}" not found`);
      }

      return result.rows[0];
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
      const result = await this.databaseService.query<Category>(
        'SELECT * FROM public.categories WHERE code = $1',
        [code.toLowerCase()],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Category with code "${code}" not found`);
      }

      return result.rows[0];
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

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateCategoryDto.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateCategoryDto.name);
      }
      if (updateCategoryDto.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updateCategoryDto.description);
      }
      if (updateCategoryDto.parent_id !== undefined) {
        updateFields.push(`parent_id = $${paramIndex++}`);
        values.push(updateCategoryDto.parent_id);
      }
      if (updateCategoryDto.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        values.push(updateCategoryDto.is_active);
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `
        UPDATE public.categories 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.databaseService.query<Category>(query, values);

      this.logger.log(`Updated category: ${id}`);
      return result.rows[0];
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

      await this.databaseService.query(
        'DELETE FROM public.categories WHERE id = $1',
        [id],
      );

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
