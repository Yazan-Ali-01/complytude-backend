import {
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
} from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import {
  TemplateField,
  TemplateVersion,
} from 'src/modules/templates/entities/template-version.entity';
import {
  Template,
  TemplateWithDetails,
} from 'src/modules/templates/entities/template.entity';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';
import { CategoryRepository } from '../../repositories/categories/category.repository';
import { RulesetRepository } from '../../repositories/rulesets/ruleset.repository';
import {
  TemplateFilters,
  TemplateRepository,
} from '../../repositories/templates/template.repository';
import { StorageService } from '../storage/storage.service';
import { TemplatesI18n } from './constants/i18n.constants';
import {
  TEMPLATE_ALLOWED_MIME_TYPES,
  TEMPLATE_DOWNLOAD_URL_EXPIRES_IN,
} from './constants/template.constants';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import { TemplateDownloadResponseDto } from './dto/template-download-response.dto';
import {
  DocxPlaceholderExtractionService,
  PlaceholderValidationResult,
} from './services/docx-placeholder-extraction.service';
import { TemplateVersionsService } from './template-versions.service';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly templateRepository: TemplateRepository,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly placeholderExtractionService: DocxPlaceholderExtractionService,
    private readonly storageService: StorageService,
    private readonly i18n: I18nService,
    private readonly categoryRepository: CategoryRepository,
    private readonly authorityRepository: AuthorityRepository,
    private readonly rulesetRepository: RulesetRepository,
  ) {}
  async create(
    createTemplateDto: CreateTemplateDto,
    createdBy: string,
  ): Promise<
    TemplateWithDetails & {
      placeholders_detected?: string[];
      validation?: PlaceholderValidationResult;
    }
  > {
    try {
      const existing = await this.templateRepository.findOne({
        filters: { key: createTemplateDto.key },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_ALREADY_EXISTS),
        );
      }

      // Validate category_id if provided
      if (createTemplateDto.category_id) {
        const categoryExists = await this.categoryRepository.findById(
          createTemplateDto.category_id,
        );
        if (!categoryExists) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.CATEGORY_NOT_FOUND),
          );
        }
      }

      // Validate authority_id if provided
      if (createTemplateDto.authority_id) {
        const authorityExists = await this.authorityRepository.findById(
          createTemplateDto.authority_id,
        );
        if (!authorityExists) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.AUTHORITY_NOT_FOUND),
          );
        }
      }

      // Validate rulesets if provided
      if (
        createTemplateDto.ruleset_keys &&
        createTemplateDto.ruleset_keys.length > 0
      ) {
        const rulesets = await this.rulesetRepository.findByKeys(
          createTemplateDto.ruleset_keys,
        );
        if (rulesets.length !== createTemplateDto.ruleset_keys.length) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.RULESET_NOT_FOUND),
          );
        }
      }

      const version = createTemplateDto.version || '1.0.0';

      let placeholders: string[] = [];
      let validationResult: PlaceholderValidationResult | undefined;

      // Extract placeholders and validate before creating template
      try {
        const fileBuffer = createTemplateDto.file.buffer;

        // Extract placeholders from DOCX
        placeholders =
          await this.placeholderExtractionService.extractPlaceholders(
            fileBuffer,
          );

        // Validate placeholders against field definitions
        validationResult =
          this.placeholderExtractionService.validateFieldsMatchPlaceholders(
            placeholders,
            createTemplateDto.fields,
          );
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        this.logger.error(
          `Failed to process template file: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_FILE_PROCESSING_FAILED),
        );
      }

      // Create template and first version in a transaction
      let templateId: string | null = null;
      try {
        await this.databaseService.transaction(async (client) => {
          const template = await this.templateRepository.create(
            {
              key: createTemplateDto.key,
              name: createTemplateDto.name,
              description: createTemplateDto.description ?? null,
              category_id: createTemplateDto.category_id ?? null,
              authority_id: createTemplateDto.authority_id ?? null,
              languages: createTemplateDto.languages,
              current_version: version,
              status: createTemplateDto.status || 'active',
              tier: createTemplateDto.tier ?? 'essential',
              file_url: null,
              created_by: createdBy,
            },
            { client },
          );

          templateId = template.id;

          // 2. Upload file to S3 using template ID
          const fileBuffer = createTemplateDto.file.buffer;
          const fileName =
            createTemplateDto.file.originalname || 'template.docx';
          const mimeType =
            createTemplateDto.file.mimetype || TEMPLATE_ALLOWED_MIME_TYPES[0];

          const uploadResult = await this.storageService.uploadTemplateFile(
            template.id, // Use template ID instead of key
            version,
            fileBuffer,
            fileName,
            mimeType,
            createdBy,
          );

          // 3. Create first version with file URL
          await this.templateVersionsService.createVersion(
            template.id,
            version,
            createTemplateDto.fields,
            uploadResult.url, // Use URL from upload
            'Initial version',
            createdBy,
            client,
          );

          // Associate rulesets if provided
          if (
            createTemplateDto.ruleset_keys &&
            createTemplateDto.ruleset_keys.length > 0
          ) {
            await this.associateRulesets(
              template.id,
              createTemplateDto.ruleset_keys,
              client,
            );
          }
        });
      } catch (transactionError) {
        // If transaction fails and we have a template ID, clean up uploaded file
        if (templateId) {
          const id = templateId as string;
          const fileKey = `templates/${id}/${version}/template.docx`;
          try {
            await this.storageService.deleteTemplateFile(fileKey);
          } catch (cleanupError) {
            this.logger.error(
              `[CRITICAL] Failed to cleanup uploaded file "${fileKey}": ${cleanupError.message}`,
            );
          }
        }
        throw transactionError;
      }

      // Fetch and return template with details (after transaction commits)
      const templateWithDetails = await this.findByKeyWithDetails(
        createTemplateDto.key,
      );

      // Add placeholder extraction results if file was uploaded
      return {
        ...templateWithDetails,
        placeholders_detected: placeholders,
        validation: validationResult,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to create template: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_CREATE_FAILED),
      );
    }
  }

  async findAll(
    filters: TemplateFilters,
    pagination: OffsetPaginationOptions,
  ): Promise<OffsetPaginationResult<Template>> {
    try {
      return await this.templateRepository.findMany(filters, pagination);
    } catch (error) {
      this.logger.error(`Failed to fetch templates: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FETCH_FAILED),
      );
    }
  }

  async findActiveTemplates(): Promise<Template[]> {
    try {
      return await this.templateRepository.findActive();
    } catch (error) {
      this.logger.error(`Failed to fetch active templates: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FETCH_FAILED),
      );
    }
  }

  async findById(id: string): Promise<Template> {
    try {
      const template = await this.templateRepository.findById(id);

      if (!template) {
        throw new NotFoundException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_NOT_FOUND, {
            args: { id },
          }),
        );
      }

      return template;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch template: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FETCH_FAILED),
      );
    }
  }

  async findByKey(key: string, client?: PoolClient): Promise<Template> {
    try {
      const template = await this.templateRepository.findOne({
        filters: { key },
        select: [
          'id',
          'key',
          'name',
          'description',
          'category_id',
          'authority_id',
          'languages',
          'current_version',
          'status',
          'tier',
          'file_url',
          'created_by',
          'created_at',
          'updated_at',
        ],
        client,
      });

      if (!template) {
        throw new NotFoundException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_NOT_FOUND, {
            args: { id: key },
          }),
        );
      }

      return template;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch template: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FETCH_FAILED),
      );
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
        category = await this.categoryRepository.findById(
          template.category_id,
          { client },
        );
      }

      // Fetch authority details
      let authority;
      if (template.authority_id) {
        authority = await this.authorityRepository.findById(
          template.authority_id,
          { client },
        );
      }

      // Fetch rulesets
      const rulesets = await this.rulesetRepository.findByTemplateId(
        template.id,
        { client },
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
        rulesets,
        current_version_details: currentVersion || null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch template with details: ${error.message}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FETCH_FAILED),
      );
    }
  }

  async update(
    key: string,
    updateTemplateDto: UpdateTemplateDto,
    _updatedBy: string,
  ): Promise<TemplateWithDetails> {
    try {
      const existing = await this.findByKey(key);

      // Validate category_id if provided
      if (updateTemplateDto.category_id) {
        const categoryExists = await this.categoryRepository.findById(
          updateTemplateDto.category_id,
        );
        if (!categoryExists) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.CATEGORY_NOT_FOUND),
          );
        }
      }

      // Validate authority_id if provided
      if (updateTemplateDto.authority_id) {
        const authorityExists = await this.authorityRepository.findById(
          updateTemplateDto.authority_id,
        );
        if (!authorityExists) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.AUTHORITY_NOT_FOUND),
          );
        }
      }

      // Validate rulesets if provided
      if (
        updateTemplateDto.ruleset_keys &&
        updateTemplateDto.ruleset_keys.length > 0
      ) {
        const rulesets = await this.rulesetRepository.findByKeys(
          updateTemplateDto.ruleset_keys,
        );
        if (rulesets.length !== updateTemplateDto.ruleset_keys.length) {
          throw new BadRequestException(
            this.i18n.t(TemplatesI18n.errors.RULESET_NOT_FOUND),
          );
        }
      }

      return await this.databaseService.transaction(async (client) => {
        if (Object.keys(updateTemplateDto).length > 0) {
          await this.templateRepository.update(
            existing.id,
            {
              ...updateTemplateDto,
              updated_at: new Date(),
            },
            { client },
          );
        }

        // Update rulesets if provided
        if (updateTemplateDto.ruleset_keys !== undefined) {
          // Remove existing associations
          await this.rulesetRepository.removeTemplateAssociations(existing.id, {
            client,
          });

          // Add new associations
          if (updateTemplateDto.ruleset_keys.length > 0) {
            await this.associateRulesets(
              existing.id,
              updateTemplateDto.ruleset_keys,
              client,
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
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_UPDATE_FAILED),
      );
    }
  }

  async deactivate(key: string): Promise<Template> {
    return this.setStatus(key, 'inactive');
  }

  async activate(key: string): Promise<Template> {
    return this.setStatus(key, 'active');
  }

  private async setStatus(
    key: string,
    status: Template['status'],
  ): Promise<Template> {
    try {
      const template = await this.templateRepository.updateStatusByKey(
        key,
        status,
      );

      if (!template) {
        throw new NotFoundException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_NOT_FOUND, {
            args: { id: key },
          }),
        );
      }

      this.logger.log(`Template ${key} is now ${status}`);
      return template;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to set template status: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_UPDATE_FAILED),
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const deleted = await this.templateRepository.deleteByKey(key);

      if (deleted === 0) {
        throw new NotFoundException(
          this.i18n.t(TemplatesI18n.errors.TEMPLATE_KEY_NOT_FOUND, {
            args: { key },
          }),
        );
      }

      this.logger.log(`Deleted template: ${key}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete template: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_DELETE_FAILED),
      );
    }
  }

  /**
   * Create a new version for an existing template with file upload
   */
  async createVersion(
    key: string,
    createVersionDto: CreateTemplateVersionDto,
    createdBy: string,
  ): Promise<{
    version: TemplateVersion;
    placeholders: string[];
    validation: PlaceholderValidationResult;
  }> {
    const template = await this.findByKey(key);
    await this.assertVersionIsNew(template.id, createVersionDto.version);

    let placeholders: string[];
    let validationResult: PlaceholderValidationResult;
    try {
      placeholders =
        await this.placeholderExtractionService.extractPlaceholders(
          createVersionDto.file.buffer,
        );
      validationResult =
        this.placeholderExtractionService.validateFieldsMatchPlaceholders(
          placeholders,
          createVersionDto.fields,
        );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Failed to process template file: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_FILE_PROCESSING_FAILED),
      );
    }

    const versionRecord = await this.publishVersion(template.id, {
      version: createVersionDto.version,
      fields: createVersionDto.fields,
      file: createVersionDto.file.buffer,
      fileName: createVersionDto.file.originalname || 'template.docx',
      mimeType:
        createVersionDto.file.mimetype || TEMPLATE_ALLOWED_MIME_TYPES[0],
      changelog: createVersionDto.changelog,
      createdBy,
    });

    return {
      version: versionRecord,
      placeholders,
      validation: validationResult,
    };
  }

  /**
   * Publishes a new version from an older one: same fields and DOCX, new version number. The old
   * version stays as it was (versions are immutable).
   */
  async rollback(
    key: string,
    fromVersion: string,
    newVersion: string,
    changelog: string | undefined,
    createdBy: string,
  ): Promise<TemplateVersion> {
    const template = await this.findByKey(key);
    const source = await this.templateVersionsService.getVersion(
      template.id,
      fromVersion,
    );
    await this.assertVersionIsNew(template.id, newVersion);

    const chunks: Buffer[] = [];
    const stream = await this.storageService.getTemplateFile(
      template.id,
      source.version,
    );
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return this.publishVersion(template.id, {
      version: newVersion,
      fields: source.fields,
      file: Buffer.concat(chunks),
      fileName: 'template.docx',
      mimeType: TEMPLATE_ALLOWED_MIME_TYPES[0],
      changelog: changelog ?? `Rolled back to ${source.version}`,
      createdBy,
    });
  }

  async listVersions(
    key: string,
    pagination: OffsetPaginationOptions,
  ): Promise<OffsetPaginationResult<TemplateVersion>> {
    const template = await this.findByKey(key);
    return this.templateVersionsService.getVersionHistory(
      template.id,
      pagination,
    );
  }

  async getVersionByKey(
    key: string,
    version: string,
  ): Promise<TemplateVersion> {
    const template = await this.findByKey(key);
    return this.templateVersionsService.getVersion(template.id, version);
  }

  /** Links active rulesets to a template; already-linked ones are left as they are. */
  async linkRulesets(key: string, rulesetKeys: string[]): Promise<string[]> {
    const template = await this.findByKey(key);
    const uniqueKeys = [...new Set(rulesetKeys)];
    const rulesets = await this.rulesetRepository.findByKeys(uniqueKeys);
    if (rulesets.length !== uniqueKeys.length) {
      throw new NotFoundException(
        this.i18n.t(TemplatesI18n.errors.RULESET_NOT_FOUND),
      );
    }
    await this.rulesetRepository.associateWithTemplate(
      template.id,
      rulesets.map((ruleset) => ruleset.id),
    );
    return uniqueKeys;
  }

  private async assertVersionIsNew(
    templateId: string,
    version: string,
  ): Promise<void> {
    const existing = await this.databaseService.query(
      'SELECT id FROM public.template_versions WHERE template_id = $1 AND version = $2',
      [templateId, version],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(
        this.i18n.t(TemplatesI18n.errors.TEMPLATE_VERSION_CONFLICT),
      );
    }
  }

  /**
   * Uploads the DOCX where the generation worker reads it
   * (templates/<templateId>/<version>/template.docx), records the version and makes it current.
   * The upload is removed again if the database write fails.
   */
  private async publishVersion(
    templateId: string,
    version: {
      version: string;
      fields: TemplateField[];
      file: Buffer;
      fileName: string;
      mimeType: string;
      changelog: string | undefined;
      createdBy: string;
    },
  ): Promise<TemplateVersion> {
    let uploaded = false;
    try {
      return await this.databaseService.transaction(async (client) => {
        const uploadResult = await this.storageService.uploadTemplateFile(
          templateId,
          version.version,
          version.file,
          version.fileName,
          version.mimeType,
          version.createdBy,
        );
        uploaded = true;

        const record = await this.templateVersionsService.createVersion(
          templateId,
          version.version,
          version.fields,
          uploadResult.url,
          version.changelog,
          version.createdBy,
          client,
        );
        await this.templateRepository.update(
          templateId,
          { current_version: version.version, file_url: uploadResult.url },
          { client },
        );
        return record;
      });
    } catch (error) {
      if (uploaded) {
        const fileKey = `templates/${templateId}/${version.version}/template.docx`;
        try {
          await this.storageService.deleteTemplateFile(fileKey);
        } catch (cleanupError) {
          this.logger.error(
            `[CRITICAL] Failed to cleanup uploaded file "${fileKey}": ${cleanupError.message}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * Associate rulesets with a template
   */
  private async associateRulesets(
    templateId: string,
    rulesetKeys: string[],
    client?: PoolClient,
  ): Promise<void> {
    // Get ruleset IDs from keys
    const rulesets = await this.rulesetRepository.findByKeys(rulesetKeys, {
      client,
    });
    const rulesetIds = rulesets.map((r) => r.id);

    // Insert associations
    await this.rulesetRepository.associateWithTemplate(templateId, rulesetIds, {
      client,
    });
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
   * Get a signed download URL for a template file
   */
  async getDownloadUrl(
    key: string,
    version?: string,
  ): Promise<TemplateDownloadResponseDto> {
    // Validate version format (semver: x.y.z) before any DB calls
    if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new BadRequestException(
        this.i18n.t(TemplatesI18n.errors.INVALID_VERSION_FORMAT),
      );
    }

    try {
      const template = await this.findByKey(key);
      const targetVersion = version || template.current_version;

      const versionRecord = await this.templateVersionsService.getVersion(
        template.id,
        targetVersion,
      );

      const fileKey = `templates/${template.id}/${versionRecord.version}/template.docx`;
      const expiresIn = TEMPLATE_DOWNLOAD_URL_EXPIRES_IN; // 15 minutes
      const downloadUrl = await this.storageService.generateTemplateSignedUrl(
        fileKey,
        expiresIn,
      );

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const fileName = `${template.key}_${targetVersion}.docx`;

      return {
        signedUrl: downloadUrl,
        expiresAt: expiresAt,
        filename: fileName,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to generate download URL for template "${key}": ${error.message}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(
          TemplatesI18n.errors.TEMPLATE_TEMPORARY_URL_GENERATION_FAILED,
        ),
      );
    }
  }
}
