import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Authority } from './entities/authority.entity';
import {
  CreateAuthorityDto,
  UpdateAuthorityDto,
} from './dto/create-authority.dto';

@Injectable()
export class AuthoritiesService {
  private readonly logger = new Logger(AuthoritiesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async create(createAuthorityDto: CreateAuthorityDto): Promise<Authority> {
    try {
      // Check if code already exists
      const existing = await this.databaseService.query(
        'SELECT id FROM public.authorities WHERE code = $1',
        [createAuthorityDto.code],
      );

      if (existing.rows.length > 0) {
        throw new ConflictException(
          `Authority with code "${createAuthorityDto.code}" already exists`,
        );
      }

      const result = await this.databaseService.query<Authority>(
        `
        INSERT INTO public.authorities (code, name, description, country, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [
          createAuthorityDto.code.toUpperCase(),
          createAuthorityDto.name,
          createAuthorityDto.description || null,
          createAuthorityDto.country || 'UAE',
          createAuthorityDto.is_active !== undefined
            ? createAuthorityDto.is_active
            : true,
        ],
      );

      this.logger.log(`Created authority: ${createAuthorityDto.code}`);
      return result.rows[0];
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to create authority');
    }
  }

  async findAll(activeOnly = false): Promise<Authority[]> {
    try {
      const query = activeOnly
        ? 'SELECT * FROM public.authorities WHERE is_active = true ORDER BY name'
        : 'SELECT * FROM public.authorities ORDER BY name';

      const result = await this.databaseService.query<Authority>(query);
      return result.rows;
    } catch (error) {
      this.logger.error(`Failed to fetch authorities: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authorities');
    }
  }

  async findById(id: string): Promise<Authority> {
    try {
      const result = await this.databaseService.query<Authority>(
        'SELECT * FROM public.authorities WHERE id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Authority with ID "${id}" not found`);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authority');
    }
  }

  async findByCode(code: string): Promise<Authority> {
    try {
      const result = await this.databaseService.query<Authority>(
        'SELECT * FROM public.authorities WHERE code = $1',
        [code.toUpperCase()],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Authority with code "${code}" not found`);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authority');
    }
  }

  async update(
    id: string,
    updateAuthorityDto: UpdateAuthorityDto,
  ): Promise<Authority> {
    try {
      await this.findById(id);

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateAuthorityDto.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateAuthorityDto.name);
      }
      if (updateAuthorityDto.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updateAuthorityDto.description);
      }
      if (updateAuthorityDto.country !== undefined) {
        updateFields.push(`country = $${paramIndex++}`);
        values.push(updateAuthorityDto.country);
      }
      if (updateAuthorityDto.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        values.push(updateAuthorityDto.is_active);
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const query = `
        UPDATE public.authorities 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.databaseService.query<Authority>(query, values);

      this.logger.log(`Updated authority: ${id}`);
      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to update authority');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findById(id);

      await this.databaseService.query(
        'DELETE FROM public.authorities WHERE id = $1',
        [id],
      );

      this.logger.log(`Deleted authority: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete authority');
    }
  }
}
