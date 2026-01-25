import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  TemplateVersion,
  TemplateField,
} from './entities/template-version.entity';
import { TemplateRepository, TemplateVersionRepository, CursorPaginationOptions, CursorPaginationResult } from '@complytude/shared';

@Injectable()
export class TemplateVersionsService {
  private readonly logger = new Logger(TemplateVersionsService.name);

  constructor(
    private readonly templateVersionRepository: TemplateVersionRepository,
    private readonly templateRepository: TemplateRepository,
  ) {}

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
      const existing = await this.templateVersionRepository.findOne({
        filters: {
          template_id: templateId,
          version,
        },
        select: ['id'],
        client,
      });

      if (existing) {
        throw new ConflictException(
          `Version ${version} already exists for template ${templateId}`,
        );
      }

      await this.templateVersionRepository.deactivateAllVersions(templateId, {
        client,
      });

      const created = await this.templateVersionRepository.create(
        {
          template_id: templateId,
          version,
          fields: JSON.stringify(fields ?? []), // Stringify JSONB field
          file_url: fileUrl,
          changelog: changelog ?? null,
          metadata: JSON.stringify(metadata ?? {}), // Stringify JSONB field
          is_active: true,
          created_by: createdBy,
        },
        { client },
      );

      this.logger.log(`Created version ${version} for template ${templateId}`);
      return created;
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

  async getVersionHistory(
    templateId: string,
    cursorOptions?: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<TemplateVersion>> {
    try {
      const versions = await this.templateVersionRepository.findMany(
        { template_id: templateId },
        cursorOptions,
      );

      return versions;
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
      const versionRecord = await this.templateVersionRepository.findOne({
        filters: {
          template_id: templateId,
          version,
        },
        select: [
          'id',
          'template_id',
          'version',
          'fields',
          'file_url',
          'changelog',
          'metadata',
          'is_active',
          'created_by',
          'created_at',
        ],
      });

      if (!versionRecord) {
        throw new NotFoundException(
          `Version ${version} not found for template ${templateId}`,
        );
      }

      return versionRecord;
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
      const version = await this.templateVersionRepository.findOne({
        filters: {
          template_id: templateId,
          is_active: true,
        },
        select: [
          'id',
          'template_id',
          'version',
          'fields',
          'file_url',
          'changelog',
          'metadata',
          'is_active',
          'created_by',
          'created_at',
        ],
        client,
      });

      return version;
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
      const versionToActivate = await this.templateVersionRepository.findOne({
        filters: {
          template_id: templateId,
          version,
        },
        select: ['id', 'file_url'],
      });

      if (!versionToActivate) {
        throw new NotFoundException(
          `Version ${version} not found for template ${templateId}`,
        );
      }

      await this.templateVersionRepository.deactivateAllVersions(templateId);

      const activatedVersion = await this.templateVersionRepository.update(
        versionToActivate.id,
        {
          is_active: true,
        },
      );

      await this.templateRepository.update(templateId, {
        current_version: version,
        file_url: versionToActivate.file_url,
      });

      this.logger.log(
        `Rolled back template ${templateId} to version ${version}`,
      );
      return activatedVersion;
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
}
