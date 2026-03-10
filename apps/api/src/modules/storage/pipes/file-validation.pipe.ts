import {
  PipeTransform,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { I18nService } from 'nestjs-i18n';
import { StorageI18n } from '../constants/i18n.constants';

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

  async transform(file: unknown): Promise<ValidatedFile> {
    if (!file || typeof file !== 'object') {
      throw new BadRequestException(
        this.i18n.t(StorageI18n.errors.NO_FILE_PROVIDED),
      );
    }

    const fileObj = file as {
      buffer?: unknown;
      originalname?: string;
      mimetype?: string;
    };
    // Check if file has required properties
    if (!fileObj.buffer || !fileObj.originalname) {
      throw new BadRequestException(
        this.i18n.t(StorageI18n.errors.INVALID_FILE_FORMAT),
      );
    }

    const buffer = fileObj.buffer as Buffer;
    const originalName = fileObj.originalname;
    const size = buffer.length;

    // Validate file size
    if (size > this.maxFileSize) {
      throw new BadRequestException(
        this.i18n.t(StorageI18n.errors.FILE_SIZE_EXCEEDS_MAX, {
          args: {
            maxSizeMb: (this.maxFileSize / 1024 / 1024).toString(),
          },
        }),
      );
    }

    if (size === 0) {
      throw new BadRequestException(this.i18n.t(StorageI18n.errors.FILE_EMPTY));
    }

    // Detect actual MIME type from file buffer
    let detectedMimeType: string;
    try {
      const fileTypeResult = await fileTypeFromBuffer(buffer);
      detectedMimeType =
        fileTypeResult?.mime || fileObj.mimetype || 'application/octet-stream';
    } catch (error) {
      this.logger.warn(
        `Failed to detect file type from buffer, using provided mime type: ${(error as Error).message}`,
      );
      detectedMimeType = fileObj.mimetype || 'application/octet-stream';
    }

    // Special handling for DOCX files (they may not be detected correctly)
    if (!detectedMimeType && originalName.toLowerCase().endsWith('.docx')) {
      detectedMimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(detectedMimeType)) {
      throw new BadRequestException(
        this.i18n.t(StorageI18n.errors.FILE_TYPE_NOT_ALLOWED, {
          args: {
            mimeType: detectedMimeType,
            allowedTypes: this.allowedMimeTypes.join(', '),
          },
        }),
      );
    }

    // Validate file extension matches MIME type
    const extension = originalName.split('.').pop()?.toLowerCase();
    const expectedExtensions = this.getExpectedExtensions(detectedMimeType);

    if (!expectedExtensions.includes(extension ?? '')) {
      throw new BadRequestException(
        this.i18n.t(StorageI18n.errors.FILE_EXTENSION_MISMATCH, {
          args: {
            extension: extension ?? '',
            mimeType: detectedMimeType,
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
