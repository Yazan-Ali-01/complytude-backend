/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  PipeTransform,
  Injectable,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';

export interface ValidatedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly logger = new Logger(FileValidationPipe.name);
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.maxFileSize =
      this.configService.get('storage.upload.maxFileSize') || 10485760;
    this.allowedMimeTypes = this.configService.get(
      'storage.upload.allowedMimeTypes',
    ) || [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
    ];
  }

  async transform(file: any): Promise<ValidatedFile> {
    if (!file) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.noFileProvided', {
          lang: I18nContext.current()?.lang,
        }),
      );
    }

    // Check if file has required properties
    if (!file.buffer || !file.originalname) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.invalidFileFormat', {
          lang: I18nContext.current()?.lang,
        }),
      );
    }

    const buffer = file.buffer;
    const originalName = file.originalname;
    const size = buffer.length;

    // Validate file size
    if (size > this.maxFileSize) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.fileTooLarge', {
          lang: I18nContext.current()?.lang,
          args: { maxSizeMB: this.maxFileSize / 1024 / 1024 },
        }),
      );
    }

    if (size === 0) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.fileEmpty', {
          lang: I18nContext.current()?.lang,
        }),
      );
    }

    // Detect actual MIME type from file buffer
    let detectedMimeType: string;
    try {
      const fileTypeResult = await fileTypeFromBuffer(buffer);
      detectedMimeType = fileTypeResult?.mime || file.mimetype;
    } catch (error) {
      this.logger.warn(
        `Failed to detect file type from buffer, using provided mime type: ${error.message}`,
      );
      detectedMimeType = file.mimetype;
    }

    // Special handling for DOCX files (they may not be detected correctly)
    if (!detectedMimeType && originalName.toLowerCase().endsWith('.docx')) {
      detectedMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(detectedMimeType)) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.invalidFileType', {
          lang: I18nContext.current()?.lang,
          args: {
          fileType: detectedMimeType,
          allowedTypes: this.allowedMimeTypes.join(', '),
        },
        }),
      );
    }

    // Validate file extension matches MIME type
    const extension = originalName.split('.').pop()?.toLowerCase();
    const expectedExtensions = this.getExpectedExtensions(detectedMimeType);

    if (!expectedExtensions.includes(extension)) {
      throw new BadRequestException(
        this.i18n.t('storage.errors.extensionMismatch', {
          lang: I18nContext.current()?.lang,
          args: {
          extension: extension || '',
          fileType: detectedMimeType,
        },
        }),
      );
    }

    this.logger.log(
      `File validated: ${originalName} (${detectedMimeType}, ${size} bytes)`,
    );

    return {
      buffer,
      originalName,
      mimeType: detectedMimeType,
      size,
    };
  }

  /**
   * Get expected file extensions for a MIME type
   */
  private getExpectedExtensions(mimeType: string): string[] {
    const extensionMap: Record<string, string[]> = {
      'application/pdf': ['pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['docx'],
      'image/png': ['png'],
      'image/jpeg': ['jpg', 'jpeg'],
    };

    return extensionMap[mimeType] || [];
  }
}
