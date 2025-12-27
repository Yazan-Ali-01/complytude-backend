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
import { TemplateRepository } from '../../repositories/templates/template.repository';
import { TemplateVersionRepository } from '../../repositories/templates/template-version.repository';

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
      const existing =
        await this.templateVersionRepository.findByTemplateIdAndVersion(
          templateId,
          version,
          { client },
        );

      if (existing) {
        throw new ConflictException(
          `Version ${version} already exists for template ${templateId}`,
        );
      }

      await this.templateVersionRepository.deactivateAllVersions(templateId, {
        client,
      });

      const created = await this.templateVersionRepository.createVersion(
        {
          template_id: templateId,
          version,
          fields,
          file_url: fileUrl,
          changelog,
          metadata,
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

  async getVersionHistory(templateId: string): Promise<TemplateVersion[]> {
    try {
      const versions =
        await this.templateVersionRepository.findByTemplateId(templateId);

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
      const versionRecord =
        await this.templateVersionRepository.findByTemplateIdAndVersion(
          templateId,
          version,
        );

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
      const version = await this.templateVersionRepository.getCurrentVersion(
        templateId,
        {
          client,
        },
      );

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
      const versionToActivate =
        await this.templateVersionRepository.findByTemplateIdAndVersion(
          templateId,
          version,
        );

      if (!versionToActivate) {
        throw new NotFoundException(
          `Version ${version} not found for template ${templateId}`,
        );
      }

      await this.templateVersionRepository.deactivateAllVersions(templateId);

      const activatedVersion =
        await this.templateVersionRepository.activateVersion(
          templateId,
          version,
        );

      await this.templateRepository.updateCurrentVersion(
        templateId,
        version,
        versionToActivate.file_url,
      );

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
