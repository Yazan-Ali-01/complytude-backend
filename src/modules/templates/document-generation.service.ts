import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Readable } from 'stream';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import {
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
} from './dto/generate-document.dto';

import { TemplatesService } from './templates.service';
import { TemplateVersionsService } from './template-versions.service';
import { StorageService } from '../storage/storage.service';
import { DatabaseService } from '../../database/database.service';
import { TenantService } from '../tenant/tenant.service';

import { TemplateValidationService } from './template-validation.service';
import { ValidationException } from 'src/common/exceptions/validation.exception';
import { DOCX_MIME_TYPE } from './constants/template.constants';
import { Template } from './entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';
@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly storageService: StorageService,
    private readonly databaseService: DatabaseService,
    private readonly tenantService: TenantService,
    private readonly templateValidationService: TemplateValidationService,
  ) {}

  /**
   * Convert Readable stream to Buffer
   * Uses async iteration for efficient memory handling
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Validate template and its version
   * Ensures template is active and has a current version
   * Validates user variables against template field definitions
   */
  private async validateTemplateAndVersion(
    templateId: string,
    variables: Record<string, unknown>,
  ): Promise<{ template: Template; templateVersion: TemplateVersion }> {
    const template = await this.templatesService.findById(templateId);

    if (template.status !== 'active') {
      throw new BadRequestException(`Template ${template.key} is not active`);
    }

    const templateVersion =
      await this.templateVersionsService.getCurrentVersion(template.id);

    if (!templateVersion) {
      throw new NotFoundException(
        `No active version found for template ${template.key}`,
      );
    }

    const validationResult = this.templateValidationService.validateVariables(
      templateVersion.fields,
      variables,
    );

    if (!validationResult.valid) {
      throw new ValidationException(validationResult.errors || []);
    }

    return { template, templateVersion };
  }

  /**
   * Fetch template file from storage and convert to buffer
   */
  private async fetchTemplateFile(templateId: string): Promise<Buffer> {
    try {
      // to test the functionality,
      // 1. create a template sample file with placeholders, and name it with the template id
      // 2. upload the file to "complytude-templates" bucket

      // TODO: should be replaced with proper file key when template uploading issue resolved
      const templateFileKey = `${templateId}.docx`;
      const templateFileStream =
        await this.storageService.getTemplateFile(templateFileKey);

      return await this.streamToBuffer(templateFileStream);
    } catch (error) {
      this.logger.error(
        `Failed to fetch template file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new NotFoundException('Template file not found');
    }
  }

  /**
   * Process document template with provided variables
   * Sanitizes errors to avoid exposing internal template structure
   */
  private processDocumentTemplate(
    templateBuffer: Buffer,
    variables: Record<string, unknown>,
  ): Buffer {
    try {
      // loading our file to PizZip to load it into the memory
      const zip = new PizZip(templateBuffer);
      // creating a new docxtemplater instance
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.setData(variables);
      doc.render();

      return doc.toBuffer();
    } catch (error) {
      this.logger.error(
        `Failed to process document template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        'Failed to render document with provided variables',
      );
    }
  }

  /**
   * Save generated document with transaction safety
   * Uploads file to S3 and stores metadata in database
   * Rolls back file upload if metadata save fails
   */
  private async saveGeneratedDocument(
    tenantId: string,
    userId: string,
    template: Template,
    templateVersion: TemplateVersion,
    outputBuffer: Buffer,
    variables: Record<string, unknown>,
  ): Promise<{ documentId: string; downloadUrl: string }> {
    let uploadedFileKey: string | null = null;

    try {
      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `${userId}_${template.key}_${timestamp}.docx`;

      // Upload file to S3
      const uploadResult = await this.storageService.uploadFile(
        tenantId,
        outputBuffer,
        filename,
        DOCX_MIME_TYPE,
        userId,
      );
      uploadedFileKey = uploadResult.key;

      // Generate signed URL
      const downloadUrl = await this.storageService.generateSignedUrl(
        tenantId,
        uploadResult.key,
      );

      // Fetch tenant schema
      const tenant = await this.tenantService.findById(tenantId);
      const schemaName = tenant.schema_name;

      // Prepare metadata
      const documentMetadata = {
        size: uploadResult.size,
        contentType: uploadResult.contentType,
        filename: filename,
      };

      const generationMetadata = {
        variables: variables,
        generatedAt: new Date().toISOString(),
        templateId: template.id,
      };

      // Store document metadata in tenant's documents table
      await this.databaseService.queryWithTenantContext(
        tenantId,
        schemaName,
        `INSERT INTO documents (
          id, tenant_id, title, content, metadata, 
          template_key, template_version, generation_metadata, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          uploadResult.key,
          tenantId,
          `${template.name || template.key} - Generated Document`,
          null,
          JSON.stringify(documentMetadata),
          template.key,
          templateVersion.version,
          JSON.stringify(generationMetadata),
          userId,
        ],
      );

      return { documentId: uploadResult.key, downloadUrl };
    } catch (error) {
      // Rollback: delete uploaded file if metadata insert failed
      if (uploadedFileKey) {
        try {
          await this.storageService.deleteFile(tenantId, uploadedFileKey);
        } catch (deleteError) {
          this.logger.warn(
            `Failed to cleanup orphaned file: ${uploadedFileKey}`,
            deleteError instanceof Error ? deleteError.stack : undefined,
          );
        }
      }

      this.logger.error(
        `Failed to save generated document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to save generated document',
      );
    }
  }

  async generateDocument(
    tenantId: string,
    userId: string,
    id: string,
    generateDocumentDto: GenerateDocumentDto,
  ): Promise<GenerateDocumentResponseDto> {
    try {
      // 1. Validate template and version
      const {
        template,
        templateVersion,
      }: { template: Template; templateVersion: TemplateVersion } =
        await this.validateTemplateAndVersion(
          id,
          generateDocumentDto.variables,
        );

      // 2. Fetch template file
      const templateBuffer = await this.fetchTemplateFile(template.id);

      // 3. Process document
      const outputBuffer = this.processDocumentTemplate(
        templateBuffer,
        generateDocumentDto.variables,
      );

      // 4. Save with transaction safety
      const { documentId, downloadUrl } = await this.saveGeneratedDocument(
        tenantId,
        userId,
        template,
        templateVersion,
        outputBuffer,
        generateDocumentDto.variables,
      );

      // 5. Return response
      return {
        documentId,
        downloadUrl,
        templateKey: template.key,
        templateVersion: templateVersion.version,
        generatedAt: new Date(),
      };
    } catch (error) {
      // specific business errors pass through
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ValidationException
      ) {
        throw error;
      }
      // Generic error for everything else
      this.logger.error(
        'Document generation failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to generate document');
    }
  }
}
