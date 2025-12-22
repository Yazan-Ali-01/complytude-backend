import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { Ruleset } from './entities/ruleset.entity';
import { CreateRulesetDto, UpdateRulesetDto } from './dto/create-ruleset.dto';

@Injectable()
export class RulesetsService {
  private readonly logger = new Logger(RulesetsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    createRulesetDto: CreateRulesetDto,
    createdBy: string,
  ): Promise<Ruleset> {
    try {
      // Check if key already exists
      const existing = await this.databaseService.query(
        'SELECT id FROM public.rulesets WHERE key = $1',
        [createRulesetDto.key],
      );

      if (existing.rows.length > 0) {
        throw new ConflictException(
          `Ruleset with key "${createRulesetDto.key}" already exists`,
        );
      }

      // Validate authority_id if provided
      if (createRulesetDto.authority_id) {
        const authorityExists = await this.databaseService.query(
          'SELECT id FROM public.authorities WHERE id = $1',
          [createRulesetDto.authority_id],
        );

        if (authorityExists.rows.length === 0) {
          throw new BadRequestException(
            `Authority with ID "${createRulesetDto.authority_id}" not found`,
          );
        }
      }

      const result = await this.databaseService.query<Ruleset>(
        `
        INSERT INTO public.rulesets 
        (key, name, description, authority_id, clauses, metadata, version, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
        [
          createRulesetDto.key,
          createRulesetDto.name,
          createRulesetDto.description || null,
          createRulesetDto.authority_id || null,
          JSON.stringify(createRulesetDto.clauses),
          JSON.stringify(createRulesetDto.metadata || {}),
          createRulesetDto.version || '1.0.0',
          createRulesetDto.status || 'active',
          createdBy,
        ],
      );

      this.logger.log(`Created ruleset: ${createRulesetDto.key}`);
      return this.parseRuleset(result.rows[0]);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to create ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to create ruleset');
    }
  }

  async findAll(authorityId?: string, status?: string): Promise<Ruleset[]> {
    try {
      let query = 'SELECT * FROM public.rulesets WHERE 1=1';
      const params: any[] = [];

      if (authorityId) {
        params.push(authorityId);
        query += ` AND authority_id = $${params.length}`;
      }

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      query += ' ORDER BY name';

      const result = await this.databaseService.query<Ruleset>(query, params);
      return result.rows.map((r) => this.parseRuleset(r));
    } catch (error) {
      this.logger.error(`Failed to fetch rulesets: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch rulesets');
    }
  }

  async findById(id: string): Promise<Ruleset> {
    try {
      const result = await this.databaseService.query<Ruleset>(
        'SELECT * FROM public.rulesets WHERE id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Ruleset with ID "${id}" not found`);
      }

      return this.parseRuleset(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch ruleset');
    }
  }

  async findByKey(key: string): Promise<Ruleset> {
    try {
      const result = await this.databaseService.query<Ruleset>(
        'SELECT * FROM public.rulesets WHERE key = $1',
        [key],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Ruleset with key "${key}" not found`);
      }

      return this.parseRuleset(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch ruleset');
    }
  }

  async findByKeys(keys: string[]): Promise<Ruleset[]> {
    try {
      if (keys.length === 0) {
        return [];
      }

      const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
      const result = await this.databaseService.query<Ruleset>(
        `SELECT * FROM public.rulesets WHERE key IN (${placeholders}) AND status = 'active'`,
        keys,
      );

      return result.rows.map((r) => this.parseRuleset(r));
    } catch (error) {
      this.logger.error(`Failed to fetch rulesets by keys: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch rulesets');
    }
  }

  async update(
    key: string,
    updateRulesetDto: UpdateRulesetDto,
  ): Promise<Ruleset> {
    try {
      const existing = await this.findByKey(key);

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateRulesetDto.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateRulesetDto.name);
      }
      if (updateRulesetDto.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updateRulesetDto.description);
      }
      if (updateRulesetDto.authority_id !== undefined) {
        // Validate authority exists
        const authorityExists = await this.databaseService.query(
          'SELECT id FROM public.authorities WHERE id = $1',
          [updateRulesetDto.authority_id],
        );
        if (authorityExists.rows.length === 0) {
          throw new BadRequestException(
            `Authority with ID "${updateRulesetDto.authority_id}" not found`,
          );
        }
        updateFields.push(`authority_id = $${paramIndex++}`);
        values.push(updateRulesetDto.authority_id);
      }
      if (updateRulesetDto.clauses !== undefined) {
        updateFields.push(`clauses = $${paramIndex++}`);
        values.push(JSON.stringify(updateRulesetDto.clauses));
      }
      if (updateRulesetDto.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updateRulesetDto.metadata));
      }
      if (updateRulesetDto.version !== undefined) {
        updateFields.push(`version = $${paramIndex++}`);
        values.push(updateRulesetDto.version);
      }
      if (updateRulesetDto.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(updateRulesetDto.status);
      }

      if (updateFields.length === 0) {
        return existing;
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(key);

      const query = `
        UPDATE public.rulesets 
        SET ${updateFields.join(', ')}
        WHERE key = $${paramIndex}
        RETURNING *
      `;

      const result = await this.databaseService.query<Ruleset>(query, values);

      this.logger.log(`Updated ruleset: ${key}`);
      return this.parseRuleset(result.rows[0]);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to update ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to update ruleset');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.findByKey(key);

      await this.databaseService.query(
        'DELETE FROM public.rulesets WHERE key = $1',
        [key],
      );

      this.logger.log(`Deleted ruleset: ${key}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete ruleset');
    }
  }

  /**
   * Parse JSONB fields from database
   */
  private parseRuleset(ruleset: any): Ruleset {
    return {
      ...ruleset,
      clauses:
        typeof ruleset.clauses === 'string'
          ? JSON.parse(ruleset.clauses)
          : ruleset.clauses,
      metadata:
        typeof ruleset.metadata === 'string'
          ? JSON.parse(ruleset.metadata)
          : ruleset.metadata,
    };
  }
}
