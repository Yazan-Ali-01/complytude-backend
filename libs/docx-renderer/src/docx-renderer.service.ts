import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { TEMPLATE_PLACEHOLDER_DELIMITERS } from './docx-renderer.constants';

interface DocxtemplaterRenderError {
  message: string;
  properties?: {
    errors?: Array<{ message: string; name: string }>;
    explanation?: string;
  };
}

@Injectable()
export class DocxRendererService {
  private readonly logger = new Logger(DocxRendererService.name);

  /**
   * Renders a DOCX buffer with the supplied variable map.
   *
   * Variables that are missing from the map are silently replaced with an
   * empty string — required-field validation must happen upstream before
   * calling this method.
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
}
