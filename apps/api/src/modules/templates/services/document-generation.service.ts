import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { Readable } from 'stream';
import { StorageService } from '../../storage/storage.service';
import { TEMPLATE_PLACEHOLDER_DELIMITERS } from '../constants/template.constants';

interface DocxtemplaterRenderError {
  message: string;
  properties?: {
    errors?: Array<{ message: string; name: string }>;
    explanation?: string;
  };
}

export interface RenderResult {
  buffer: Buffer;
  templateId: string;
  version: string;
}

/**
 * Core document rendering service.
 *
 * Responsibility: given a DOCX template buffer + a validated variable map,
 * produce a fully-rendered DOCX buffer using docxtemplater.
 *
 * Two entry points:
 * - `renderBuffer` — pure, synchronous (no I/O). Useful for previews when
 *   the caller already has the template bytes.
 * - `render` — async full-pipeline: fetches the template from S3, then
 *   delegates to `renderBuffer`.
 */
@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Renders a DOCX buffer with the supplied variable map.
   *
   * Variables that are missing from the map are silently replaced with an
   * empty string — required-field validation must happen upstream (via
   * VariableValidationService) before calling this method.
   *
   * @throws InternalServerErrorException if the buffer is not a valid ZIP/DOCX.
   * @throws InternalServerErrorException if docxtemplater fails to render.
   */
  renderBuffer(
    templateBuffer: Buffer,
    variables: Record<string, unknown>,
  ): Buffer {
    let zip: PizZip;
    try {
      zip = new PizZip(templateBuffer);
    } catch (err) {
      this.logger.error(
        'Failed to parse DOCX buffer as ZIP — template may be corrupt',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Template file is corrupt or not a valid DOCX',
      );
    }

    let doc: Docxtemplater;
    try {
      doc = new Docxtemplater(zip, {
        delimiters: TEMPLATE_PLACEHOLDER_DELIMITERS,
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });
    } catch (err) {
      this.logger.error(
        'Failed to initialize docxtemplater',
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Failed to initialize template renderer',
      );
    }

    try {
      doc.render(variables);
    } catch (err) {
      const dtErr = err as DocxtemplaterRenderError;
      const details =
        dtErr.properties?.errors?.map((e) => e.message).join('; ') ??
        dtErr.properties?.explanation ??
        dtErr.message;
      this.logger.error(`Template rendering failed: ${details}`);
      throw new InternalServerErrorException('Document rendering failed');
    }

    return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  }

  /**
   * Fetches a template file from S3 by templateId + version, then renders it.
   *
   * NotFoundException from StorageService propagates unchanged so the caller
   * can return a 404 without extra wrapping.
   */
  async render(
    templateId: string,
    version: string,
    variables: Record<string, unknown>,
  ): Promise<RenderResult> {
    this.logger.log(
      `Rendering template: templateId=${templateId} version=${version}`,
    );

    const stream = await this.storageService.getTemplateFile(
      templateId,
      version,
    );

    const templateBuffer = await this.streamToBuffer(stream);
    const buffer = this.renderBuffer(templateBuffer, variables);

    this.logger.log(
      `Template rendered: templateId=${templateId} version=${version} outputBytes=${buffer.length}`,
    );

    return { buffer, templateId, version };
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => {
        this.logger.error(
          'Error reading template stream from storage',
          err instanceof Error ? err.stack : String(err),
        );
        reject(
          new InternalServerErrorException(
            'Failed to read template file from storage',
          ),
        );
      });
    });
  }
}
