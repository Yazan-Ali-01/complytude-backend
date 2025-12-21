import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from 'src/core/database/database.service';
import {
  Template,
  TemplateWithDetails,
} from '../shared/entities/template.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import { TemplateVersionsService } from './template-versions.service';
import { RulesetsService } from '../rulesets/rulesets.service';
import { PoolClient } from 'pg';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly rulesetsService: RulesetsService,
  ) {}

  async create(
    createTemplateDto: CreateTemplateDto,
    createdBy: string,
  ): Promise<TemplateWithDetails> {
    try {
      // Check if key already exists
      const existing = await this.databaseService.query(
        'SELECT id FROM public.templates WHERE key = $1',
        [createTemplateDto.key],
      );

      if (existing.rows.length > 0) {
        throw new ConflictException(
          `Template with key "${createTemplateDto.key}" already exists`,
        );
      }

      // Validate category_id if provided
      if (createTemplateDto.category_id) {
        const categoryExists = await this.databaseService.query(
          'SELECT id FROM public.categories WHERE id = $1',
          [createTemplateDto.category_id],
        );
        if (categoryExists.rows.length === 0) {
          throw new BadRequestException(
            `Category with ID "${createTemplateDto.category_id}" not found`,
          );
        }
      }

      // Validate authority_id if provided
      if (createTemplateDto.authority_id) {
        const authorityExists = await this.databaseService.query(
          'SELECT id FROM public.authorities WHERE id = $1',
          [createTemplateDto.authority_id],
        );
        if (authorityExists.rows.length === 0) {
          throw new BadRequestException(
            `Authority with ID "${createTemplateDto.authority_id}" not found`,
          );
        }
      }

      // Validate rulesets if provided
      if (
        createTemplateDto.ruleset_keys &&
        createTemplateDto.ruleset_keys.length > 0
      ) {
        const rulesets = await this.rulesetsService.findByKeys(
          createTemplateDto.ruleset_keys,
        );
        if (rulesets.length !== createTemplateDto.ruleset_keys.length) {
          throw new BadRequestException('One or more ruleset keys are invalid');
        }
      }

      const version = createTemplateDto.version || '1.0.0';

      // Create template and first version in a transaction
      await this.databaseService.transaction(async (client) => {
        // Create template record
        const templateResult = await client.query<Template>(
          `
          INSERT INTO public.templates 
          (key, name, description, category_id, authority_id, languages, current_version, status, file_url, metadata, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
          [
            createTemplateDto.key,
            createTemplateDto.name,
            createTemplateDto.description || null,
            createTemplateDto.category_id || null,
            createTemplateDto.authority_id || null,
            createTemplateDto.languages,
            version,
            createTemplateDto.status || 'active',
            createTemplateDto.file_url || null,
            JSON.stringify(createTemplateDto.metadata || {}),
            createdBy,
          ],
        );

        const template = this.parseTemplate(templateResult.rows[0]);

        // Create first version
        await this.templateVersionsService.createVersion(
          template.id,
          version,
          createTemplateDto.fields,
          createTemplateDto.file_url || '',
          'Initial version',
          createTemplateDto.metadata || {},
          createdBy,
          client,
        );

        // Associate rulesets if provided
        if (
          createTemplateDto.ruleset_keys &&
          createTemplateDto.ruleset_keys.length > 0
        ) {
          await this.associateRulesets(
            client,
            template.id,
            createTemplateDto.ruleset_keys,
          );
        }

        this.logger.log(`Created template: ${createTemplateDto.key}`);
      });

      // Fetch and return template with details (after transaction commits)
      return this.findByKeyWithDetails(createTemplateDto.key);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to create template: ${error.message}`);
      throw new InternalServerErrorException('Failed to create template');
    }
  }

  async findAll(
    status?: string,
    categoryId?: string,
    authorityId?: string,
    language?: string,
    page = 1,
    limit = 50,
  ): Promise<{
    templates: Template[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      let query = 'SELECT * FROM public.templates WHERE 1=1';
      const params: any[] = [];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (categoryId) {
        params.push(categoryId);
        query += ` AND category_id = $${params.length}`;
      }

      if (authorityId) {
        params.push(authorityId);
        query += ` AND authority_id = $${params.length}`;
      }

      if (language) {
        params.push(language);
        query += ` AND $${params.length} = ANY(languages)`;
      }

      // Get total count
      const countResult = await this.databaseService.query(
        `SELECT COUNT(*) as count FROM (${query}) as filtered`,
        params,
      );
      const total = parseInt(countResult.rows[0].count as string, 10);

      // Add pagination
      const offset = (page - 1) * limit;
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await this.databaseService.query<Template>(query, params);

      return {
        templates: result.rows.map((t) => this.parseTemplate(t)),
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch templates: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch templates');
    }
  }

  async findActiveTemplates(): Promise<Template[]> {
    try {
      const result = await this.databaseService.query<Template>(
        'SELECT * FROM public.templates WHERE status = $1 ORDER BY name',
        ['active'],
      );

      return result.rows.map((t) => this.parseTemplate(t));
    } catch (error) {
      this.logger.error(`Failed to fetch active templates: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to fetch active templates',
      );
    }
  }

  async findById(id: string): Promise<Template> {
    try {
      const result = await this.databaseService.query<Template>(
        'SELECT * FROM public.templates WHERE id = $1',
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Template with ID "${id}" not found`);
      }

      return this.parseTemplate(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch template: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch template');
    }
  }

  async findByKey(key: string, client?: PoolClient): Promise<Template> {
    try {
      const result = client
        ? await client.query<Template>(
            'SELECT * FROM public.templates WHERE key = $1',
            [key],
          )
        : await this.databaseService.query<Template>(
            'SELECT * FROM public.templates WHERE key = $1',
            [key],
          );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Template with key "${key}" not found`);
      }

      return this.parseTemplate(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch template: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch template');
    }
  }

  async findByKeyWithDetails(
    key: string,
    client?: PoolClient,
  ): Promise<TemplateWithDetails> {
    try {
      const template = await this.findByKey(key, client);

      // Fetch category details
      let category;
      if (template.category_id) {
        const categoryResult = client
          ? await client.query(
              'SELECT id, code, name FROM public.categories WHERE id = $1',
              [template.category_id],
            )
          : await this.databaseService.query(
              'SELECT id, code, name FROM public.categories WHERE id = $1',
              [template.category_id],
            );
        category = categoryResult.rows[0];
      }

      // Fetch authority details
      let authority;
      if (template.authority_id) {
        const authorityResult = client
          ? await client.query(
              'SELECT id, code, name FROM public.authorities WHERE id = $1',
              [template.authority_id],
            )
          : await this.databaseService.query(
              'SELECT id, code, name FROM public.authorities WHERE id = $1',
              [template.authority_id],
            );
        authority = authorityResult.rows[0];
      }

      // Fetch rulesets
      const rulesetsResult = client
        ? await client.query(
            `
        SELECT r.id, r.key, r.name
        FROM public.rulesets r
        INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
        WHERE tr.template_id = $1
      `,
            [template.id],
          )
        : await this.databaseService.query(
            `
        SELECT r.id, r.key, r.name
        FROM public.rulesets r
        INNER JOIN public.template_rulesets tr ON r.id = tr.ruleset_id
        WHERE tr.template_id = $1
      `,
            [template.id],
          );

      // Fetch current version details
      const currentVersion =
        await this.templateVersionsService.getCurrentVersion(
          template.id,
          client,
        );

      return {
        ...template,
        category,
        authority,
        rulesets: rulesetsResult.rows,
        current_version_details: currentVersion || undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch template with details: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch template with details',
      );
    }
  }

  async update(
    key: string,
    updateTemplateDto: UpdateTemplateDto,
    updatedBy: string,
  ): Promise<TemplateWithDetails> {
    try {
      const existing = await this.findByKey(key);

      // Validate category_id if provided
      if (updateTemplateDto.category_id) {
        const categoryExists = await this.databaseService.query(
          'SELECT id FROM public.categories WHERE id = $1',
          [updateTemplateDto.category_id],
        );
        if (categoryExists.rows.length === 0) {
          throw new BadRequestException(
            `Category with ID "${updateTemplateDto.category_id}" not found`,
          );
        }
      }

      // Validate authority_id if provided
      if (updateTemplateDto.authority_id) {
        const authorityExists = await this.databaseService.query(
          'SELECT id FROM public.authorities WHERE id = $1',
          [updateTemplateDto.authority_id],
        );
        if (authorityExists.rows.length === 0) {
          throw new BadRequestException(
            `Authority with ID "${updateTemplateDto.authority_id}" not found`,
          );
        }
      }

      // Validate rulesets if provided
      if (
        updateTemplateDto.ruleset_keys &&
        updateTemplateDto.ruleset_keys.length > 0
      ) {
        const rulesets = await this.rulesetsService.findByKeys(
          updateTemplateDto.ruleset_keys,
        );
        if (rulesets.length !== updateTemplateDto.ruleset_keys.length) {
          throw new BadRequestException('One or more ruleset keys are invalid');
        }
      }

      return await this.databaseService.transaction(async (client) => {
        // Build update query for template
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updateTemplateDto.name !== undefined) {
          updateFields.push(`name = $${paramIndex++}`);
          values.push(updateTemplateDto.name);
        }
        if (updateTemplateDto.description !== undefined) {
          updateFields.push(`description = $${paramIndex++}`);
          values.push(updateTemplateDto.description);
        }
        if (updateTemplateDto.category_id !== undefined) {
          updateFields.push(`category_id = $${paramIndex++}`);
          values.push(updateTemplateDto.category_id);
        }
        if (updateTemplateDto.authority_id !== undefined) {
          updateFields.push(`authority_id = $${paramIndex++}`);
          values.push(updateTemplateDto.authority_id);
        }
        if (updateTemplateDto.languages !== undefined) {
          updateFields.push(`languages = $${paramIndex++}`);
          values.push(updateTemplateDto.languages);
        }
        if (updateTemplateDto.status !== undefined) {
          updateFields.push(`status = $${paramIndex++}`);
          values.push(updateTemplateDto.status);
        }
        if (updateTemplateDto.metadata !== undefined) {
          updateFields.push(`metadata = $${paramIndex++}`);
          values.push(JSON.stringify(updateTemplateDto.metadata));
        }

        // If fields or file_url updated, create new version
        if (
          updateTemplateDto.fields ||
          updateTemplateDto.file_url ||
          updateTemplateDto.version
        ) {
          const currentVersion =
            await this.templateVersionsService.getCurrentVersion(
              existing.id,
              client,
            );
          const newVersion =
            updateTemplateDto.version ||
            this.incrementVersion(existing.current_version);
          const newFields =
            updateTemplateDto.fields || currentVersion?.fields || [];
          const newFileUrl =
            updateTemplateDto.file_url || currentVersion?.file_url || '';

          await this.templateVersionsService.createVersion(
            existing.id,
            newVersion,
            newFields,
            newFileUrl,
            updateTemplateDto.changelog,
            updateTemplateDto.metadata || {},
            updatedBy,
            client,
          );

          // Update template's current_version field
          updateFields.push(`current_version = $${paramIndex++}`);
          values.push(newVersion);
        }

        // Update template if there are fields to update
        if (updateFields.length > 0) {
          updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
          values.push(key);

          await client.query(
            `UPDATE public.templates SET ${updateFields.join(', ')} WHERE key = $${paramIndex}`,
            values,
          );
        }

        // Update rulesets if provided
        if (updateTemplateDto.ruleset_keys !== undefined) {
          // Remove existing associations
          await client.query(
            'DELETE FROM public.template_rulesets WHERE template_id = $1',
            [existing.id],
          );

          // Add new associations
          if (updateTemplateDto.ruleset_keys.length > 0) {
            await this.associateRulesets(
              client,
              existing.id,
              updateTemplateDto.ruleset_keys,
            );
          }
        }

        this.logger.log(`Updated template: ${key}`);

        // Return updated template with details
        return this.findByKeyWithDetails(key, client);
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to update template: ${error.message}`);
      throw new InternalServerErrorException('Failed to update template');
    }
  }

  async deactivate(key: string): Promise<Template> {
    try {
      const _template = await this.findByKey(key);

      const result = await this.databaseService.query<Template>(
        'UPDATE public.templates SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *',
        ['inactive', key],
      );

      this.logger.log(`Deactivated template: ${key}`);
      return this.parseTemplate(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to deactivate template: ${error.message}`);
      throw new InternalServerErrorException('Failed to deactivate template');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.findByKey(key);

      await this.databaseService.query(
        'DELETE FROM public.templates WHERE key = $1',
        [key],
      );

      this.logger.log(`Deleted template: ${key}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete template: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete template');
    }
  }

  /**
   * Associate rulesets with a template
   */
  private async associateRulesets(
    client: any,
    templateId: string,
    rulesetKeys: string[],
  ): Promise<void> {
    // Get ruleset IDs from keys
    const rulesets = await this.rulesetsService.findByKeys(rulesetKeys);
    const rulesetIds = rulesets.map((r) => r.id);

    // Insert associations
    for (const rulesetId of rulesetIds) {
      await client.query(
        'INSERT INTO public.template_rulesets (template_id, ruleset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [templateId, rulesetId],
      );
    }
  }

  /**
   * Increment version number (simple semver increment)
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length === 3) {
      parts[2] = String(parseInt(parts[2], 10) + 1);
      return parts.join('.');
    }
    return version;
  }

  /**
   * Parse JSONB fields from database
   */
  private parseTemplate(template: any): Template {
    return {
      ...template,
      metadata:
        typeof template.metadata === 'string'
          ? JSON.parse(template.metadata as string)
          : template.metadata,
    };
  }
}
