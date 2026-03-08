import {
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
} from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { TemplateVersion } from 'src/modules/templates/entities/template-version.entity';
import {
  Template,
  TemplateWithDetails,
} from 'src/modules/templates/entities/template.entity';
import { CommonI18n } from '../../common/constants/i18n.constants';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';
import { CategoryRepository } from '../../repositories/categories/category.repository';
import { RulesetRepository } from '../../repositories/rulesets/ruleset.repository';
import { TemplateRepository } from '../../repositories/templates/template.repository';
import { StorageService } from '../storage/storage.service';
import { TemplatesI18n } from './constants/i18n.constants';
import {
  TEMPLATE_ALLOWED_MIME_TYPES,
  TEMPLATE_DOWNLOAD_URL_EXPIRES_IN,
} from './constants/template.constants';
import {
  CreateTemplateVersionDto,
  CreateTemplateVersionResponseDto,
} from './dto/create-template-version.dto';
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
    @I18n() private readonly i18n: I18nService,
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
          // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPLATE_ALREADY_EXISTS)
          this.i18n.t(CommonI18n.errors.CONFLICT) ??
            `Template with key "${createTemplateDto.key}" already exists`,
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
            this.i18n.t(TemplatesI18n.errors.AUTHORITY_NOT_FOUND),
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
        this.logger.error(
          `Failed to process template file: ${error.message}`,
          error.stack,
        );
        throw new InternalServerErrorException(
          this.i18n.t(TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
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
              file_url: null,
              metadata: JSON.stringify(createTemplateDto.metadata ?? {}), // Stringify JSONB field
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
        this.i18n.t(TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
      );
    }
  }

  async findAll(
    status?: string,
    categoryId?: string,
    authorityId?: string,
    language?: string,
    cursorOptions?: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<Template>> {
    try {
      const result = await this.templateRepository.findMany(
        {
          status,
          categoryId,
          authorityId,
          language,
        },
        cursorOptions,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch templates: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
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
        this.i18n.t(TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED),
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
          'file_url',
          'metadata',
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
            this.i18n.t(TemplatesI18n.errors.AUTHORITY_NOT_FOUND),
          );
        }
      }

      return await this.databaseService.transaction(async (client) => {
        if (Object.keys(updateTemplateDto).length > 0) {
          await this.templateRepository.update(
            existing.id,
            {
              ...updateTemplateDto,
              metadata:
                updateTemplateDto.metadata === undefined
                  ? JSON.stringify(updateTemplateDto.metadata)
                  : undefined,
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
    try {
      const template = await this.templateRepository.updateStatusByKey(
        key,
        'inactive',
      );

      if (!template) {
        throw new NotFoundException(
          // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPLATE_NOT_FOUND)
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Template with key "${key}" not found`,
        );
      }

      this.logger.log(`Deactivated template: ${key}`);
      return template;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to deactivate template: ${error.message}`);
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
          // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPLATE_NOT_FOUND)
          this.i18n.t(CommonI18n.errors.NOT_FOUND) ??
            `Template with key "${key}" not found`,
        );
      }

      this.logger.log(`Deleted template: ${key}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete template: ${error.message}`);
      throw new InternalServerErrorException(
        // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPLATE_DELETE_FAILED)
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to delete template',
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
  ): Promise<CreateTemplateVersionResponseDto> {
    // Find template by key
    const template = await this.findByKey(key);

    // Check if version already exists
    const existingVersion = await this.databaseService.query(
      'SELECT id FROM public.template_versions WHERE template_id = $1 AND version = $2',
      [template.id, createVersionDto.version],
    );
    if (existingVersion.rows.length > 0) {
      throw new ConflictException(
        // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPLATE_VERSION_CONFLICT)
        this.i18n.t(CommonI18n.errors.CONFLICT) ??
          `Version ${createVersionDto.version} already exists for template ${key}`,
      );
    }

    // Extract placeholders from DOCX
    let placeholders: string[] = [];
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
      this.logger.error(
        `Failed to process template file: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED)
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to process template file',
      );
    }

    let versionRecord: TemplateVersion | undefined;
    let fileUrl: string;

    try {
      await this.databaseService.transaction(async (client) => {
        // Upload file to S3
        const fileName = createVersionDto.file.originalname || 'template.docx';
        const mimeType =
          createVersionDto.file.mimetype || TEMPLATE_ALLOWED_MIME_TYPES[0];

        const uploadResult = await this.storageService.uploadTemplateFile(
          template.id,
          createVersionDto.version,
          createVersionDto.file.buffer,
          fileName,
          mimeType,
          createdBy,
        );

        fileUrl = uploadResult.url;

        // Create version record
        versionRecord = await this.templateVersionsService.createVersion(
          template.id,
          createVersionDto.version,
          createVersionDto.fields,
          fileUrl,
          createVersionDto.changelog,
          createVersionDto.metadata || {},
          createdBy,
          client,
        );
        // Update template's current_version
        await this.templateRepository.update(
          template.id,
          {
            current_version: createVersionDto.version,
            file_url: fileUrl,
          },
          { client },
        );
      });
    } catch (error) {
      // Clean up uploaded file if transaction fails
      if (fileUrl!) {
        const fileKey = `templates/${template.id}/${createVersionDto.version}/template.docx`;
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

    return {
      ...versionRecord,
      placeholdersDetected: placeholders,
      validation: {
        isValid:
          validationResult.unmatchedPlaceholders.length === 0 &&
          validationResult.unusedFields.length === 0,
        missingInFields: validationResult.unmatchedPlaceholders,
        missingInTemplate: validationResult.unusedFields,
        matches: validationResult.matched,
      },
    } as CreateTemplateVersionResponseDto;
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
        // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.AUTHORITY_NOT_FOUND)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          `Invalid version format: ${version}`,
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
        // TemplatesI18n is required but in phase 2 (TemplatesI18n.errors.TEMPORARY_URL_GENERATION_FAILED)
        this.i18n.t(CommonI18n.errors.INTERNAL_SERVER_ERROR) ??
          'Failed to generate download URL for template',
      );
    }
  }

  /**
   * Parse JSONB fields from database
   */
  private parseTemplate(
    template: Record<string, unknown> & {
      metadata?: string | Record<string, unknown>;
    },
  ): Template {
    const parsed = {
      ...template,
      metadata:
        typeof template.metadata === 'string'
          ? (JSON.parse(template.metadata) as Record<string, unknown>)
          : (template.metadata ?? {}),
    };
    return parsed as Template;
  }
}
