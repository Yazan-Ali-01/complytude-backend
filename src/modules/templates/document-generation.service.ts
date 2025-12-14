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

  async generateDocument(
    tenantId: string,
    userId: string,
    id: string,
    generateDocumentDto: GenerateDocumentDto,
  ): Promise<GenerateDocumentResponseDto> {
    try {
      const template = await this.templatesService.findById(id);

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
        generateDocumentDto.variables,
      );
      if (!validationResult.valid) {
        this.logger.error(
          `${tenantId} - ${userId} - ${id} - Validation errors: ${JSON.stringify(validationResult.errors)}`,
        );

        throw new ValidationException(validationResult.errors || []);
      }

      // static file name for now
      // TODO: should be replaced with proper variable when template uploading issue resolved
      const templateFileKey = `1765652114963-dumb_contract.docx`;
      const templateFileStream =
        await this.storageService.getTemplateFile(templateFileKey);

      const templateBuffer = await this.streamToBuffer(templateFileStream);

      let outputBuffer: Buffer;
      try {
        // loading our file to PizZip to load it into the memory
        const zip = new PizZip(templateBuffer);
        // creating a new docxtemplater instance
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        doc.setData(generateDocumentDto.variables);

        doc.render();

        const outputZip = doc.getZip().generate({
          type: 'nodebuffer',
          compression: 'DEFLATE',
        });
        outputBuffer = Buffer.from(outputZip);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Docxtemplater error: ${errorMessage}`);
        throw new InternalServerErrorException(
          `Failed to process template: ${errorMessage}`,
        );
      }

      const generatedAt = new Date().toISOString();
      const filename = `${template.key}_generated_${generatedAt.replace(/[:.]/g, '-')}.docx`;

      const uploadResult = await this.storageService.uploadFile(
        tenantId,
        outputBuffer,
        filename,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        userId,
      );

      // Generate signed URL
      const downloadUrl = await this.storageService.generateSignedUrl(
        tenantId,
        uploadResult.key,
      );

      // Store document metadata in tenant's documents table
      try {
        const tenant = await this.tenantService.findById(tenantId);
        const schemaName = tenant.schema_name;

        const documentMetadata = {
          size: uploadResult.size,
          contentType: uploadResult.contentType,
          filename: filename,
        };

        const generationMetadata = {
          variables: generateDocumentDto.variables,
          generatedAt: generatedAt,
          templateId: template.id,
        };

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
      } catch (metadataError) {
        // log the error without stopping the flow
        const errorMessage =
          metadataError instanceof Error
            ? metadataError.message
            : 'Unknown error';
        this.logger.error(
          `Failed to store document metadata for tenant ${tenantId}: ${errorMessage}`,
          metadataError instanceof Error ? metadataError.stack : undefined,
        );
      }

      return {
        documentId: uploadResult.key,
        downloadUrl,
        templateKey: template.key,
        templateVersion: templateVersion.version,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to generate document: ${errorMessage}`,
        errorStack,
      );
      throw new InternalServerErrorException('Failed to generate document');
    }
  }
}
