import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from 'src/core/database/database.service';
import { PoolClient } from 'pg';
import {
  TemplateVersion,
  TemplateField,
} from './entities/template-version.entity';

@Injectable()
export class TemplateVersionsService {
  private readonly logger = new Logger(TemplateVersionsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async createVersion(
    templateId: string,
    version: string,
    fields: TemplateField[],
    fileUrl: string,
    changelog: string | undefined,
    metadata: Record<string, any>,
    createdBy: string,
    client?: PoolClient,
  ): Promise<TemplateVersion> {
    try {
      // Check if version already exists for this template
      const existing = client
        ? await client.query(
            'SELECT id FROM public.template_versions WHERE template_id = $1 AND version = $2',
            [templateId, version],
          )
        : await this.databaseService.query(
            'SELECT id FROM public.template_versions WHERE template_id = $1 AND version = $2',
            [templateId, version],
          );

      if (existing.rows.length > 0) {
        throw new ConflictException(
          `Version ${version} already exists for template ${templateId}`,
        );
      }

      // Deactivate all previous versions
      if (client) {
        await client.query(
          'UPDATE public.template_versions SET is_active = false WHERE template_id = $1',
          [templateId],
        );
      } else {
        await this.databaseService.query(
          'UPDATE public.template_versions SET is_active = false WHERE template_id = $1',
          [templateId],
        );
      }

      // Create new version
      const result = client
        ? await client.query<TemplateVersion>(
            `
        INSERT INTO public.template_versions 
        (template_id, version, fields, file_url, changelog, metadata, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
        RETURNING *
      `,
            [
              templateId,
              version,
              JSON.stringify(fields),
              fileUrl,
              changelog || null,
              JSON.stringify(metadata),
              createdBy,
            ],
          )
        : await this.databaseService.query<TemplateVersion>(
            `
        INSERT INTO public.template_versions 
        (template_id, version, fields, file_url, changelog, metadata, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, true, $7)
        RETURNING *
      `,
            [
              templateId,
              version,
              JSON.stringify(fields),
              fileUrl,
              changelog || null,
              JSON.stringify(metadata),
              createdBy,
            ],
          );

      this.logger.log(`Created version ${version} for template ${templateId}`);
      return this.parseVersion(result.rows[0]);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create template version: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to create template version',
      );
    }
  }

  async getVersionHistory(templateId: string): Promise<TemplateVersion[]> {
    try {
      const result = await this.databaseService.query<TemplateVersion>(
        'SELECT * FROM public.template_versions WHERE template_id = $1 ORDER BY created_at DESC',
        [templateId],
      );

      return result.rows.map((v) => this.parseVersion(v));
    } catch (error) {
      this.logger.error(`Failed to fetch version history: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch version history');
    }
  }

  async getVersion(
    templateId: string,
    version: string,
  ): Promise<TemplateVersion> {
    try {
      const result = await this.databaseService.query<TemplateVersion>(
        'SELECT * FROM public.template_versions WHERE template_id = $1 AND version = $2',
        [templateId, version],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Version ${version} not found for template ${templateId}`,
        );
      }

      return this.parseVersion(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch template version: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to fetch template version',
      );
    }
  }

  async getCurrentVersion(
    templateId: string,
    client?: PoolClient,
  ): Promise<TemplateVersion | null> {
    try {
      const result = client
        ? await client.query<TemplateVersion>(
            'SELECT * FROM public.template_versions WHERE template_id = $1 AND is_active = true',
            [templateId],
          )
        : await this.databaseService.query<TemplateVersion>(
            'SELECT * FROM public.template_versions WHERE template_id = $1 AND is_active = true',
            [templateId],
          );

      if (result.rows.length === 0) {
        return null;
      }

      return this.parseVersion(result.rows[0]);
    } catch (error) {
      this.logger.error(`Failed to fetch current version: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch current version');
    }
  }

  async rollback(
    templateId: string,
    version: string,
  ): Promise<TemplateVersion> {
    try {
      // Check if version exists
      const versionToActivate = await this.getVersion(templateId, version);

      // Deactivate all versions
      await this.databaseService.query(
        'UPDATE public.template_versions SET is_active = false WHERE template_id = $1',
        [templateId],
      );

      // Activate the specified version
      const result = await this.databaseService.query<TemplateVersion>(
        'UPDATE public.template_versions SET is_active = true WHERE template_id = $1 AND version = $2 RETURNING *',
        [templateId, version],
      );

      // Update template's current_version
      await this.databaseService.query(
        'UPDATE public.templates SET current_version = $1, file_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [version, versionToActivate.file_url, templateId],
      );

      this.logger.log(
        `Rolled back template ${templateId} to version ${version}`,
      );
      return this.parseVersion(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to rollback template version: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to rollback template version',
      );
    }
  }

  /**
   * Parse JSONB fields from database
   */
  private parseVersion(version: any): TemplateVersion {
    return {
      ...version,
      fields:
        typeof version.fields === 'string'
          ? JSON.parse(version.fields as string)
          : version.fields,
      metadata:
        typeof version.metadata === 'string'
          ? JSON.parse(version.metadata as string)
          : version.metadata,
    };
  }
}
