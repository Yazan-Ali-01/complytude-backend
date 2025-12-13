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

@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Convert Readable stream to Buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
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

      // static file name for now
      // TODO: should be replaced with proper variable when template uploading issue resolved
      const templateFileStream = await this.storageService.getTemplateFile(
        '1765652114963-dumb_contract.docx',
      );

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
        throw new BadRequestException(
          `Failed to process template: ${errorMessage}`,
        );
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${template.key}_generated_${timestamp}.docx`;

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
