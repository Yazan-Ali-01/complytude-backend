import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

const GOTENBERG_TIMEOUT_MS = 30_000;
const WATERMARK_OPACITY = 0.15;
const WATERMARK_FONT_SIZE = 72;
const WATERMARK_ROTATION = 45;
const WATERMARK_REPEAT_STEP_X = 250;
const WATERMARK_REPEAT_STEP_Y = 200;

@Injectable()
export class PdfConversionService {
  private readonly logger = new Logger(PdfConversionService.name);
  private readonly gotenbergUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.gotenbergUrl = this.configService.get<string>('GOTENBERG_URL')!;
  }

  async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const url = `${this.gotenbergUrl}/forms/libreoffice/convert`;
    const formData = new FormData();

    formData.append(
      'files',
      new Blob([new Uint8Array(docxBuffer)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'document.docx',
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.error(
          `Gotenberg conversion timed out after ${GOTENBERG_TIMEOUT_MS}ms`,
        );
        throw new GatewayTimeoutException(
          'PDF conversion service timed out. Please try again.',
        );
      }
      this.logger.error(
        `Gotenberg unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'PDF conversion service is unavailable. Please try again later.',
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Gotenberg returned ${response.status}: ${body.slice(0, 500)}`,
      );

      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(
          'Invalid document: unable to convert to PDF. Ensure the file is a valid DOCX.',
        );
      }

      throw new ServiceUnavailableException(
        'PDF conversion service returned an unexpected error.',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async addWatermark(pdfBuffer: Buffer, text: string): Promise<Buffer> {
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(pdfBuffer);
    } catch (error) {
      this.logger.error(
        `Failed to load PDF for watermarking: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException(
        'Invalid PDF buffer: unable to apply watermark.',
      );
    }

    const pages = doc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      // Tile the watermark text diagonally across the page
      for (let y = -height; y < height * 2; y += WATERMARK_REPEAT_STEP_Y) {
        for (let x = -width; x < width * 2; x += WATERMARK_REPEAT_STEP_X) {
          page.drawText(text, {
            x,
            y,
            size: WATERMARK_FONT_SIZE,
            color: rgb(0.5, 0.5, 0.5),
            opacity: WATERMARK_OPACITY,
            rotate: degrees(WATERMARK_ROTATION),
          });
        }
      }
    }

    const modified = await doc.save();
    return Buffer.from(modified);
  }
}
