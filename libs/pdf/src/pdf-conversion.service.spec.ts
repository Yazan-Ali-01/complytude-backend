import {
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { PdfConversionService } from './pdf-conversion.service';

const GOTENBERG_URL = 'http://localhost:3100';

function makeConfigService(url = GOTENBERG_URL): jest.Mocked<ConfigService> {
  return {
    get: jest.fn((key: string) => (key === 'GOTENBERG_URL' ? url : undefined)),
  } as unknown as jest.Mocked<ConfigService>;
}

async function makeMinimalPdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('PdfConversionService', () => {
  let service: PdfConversionService;

  beforeEach(() => {
    service = new PdfConversionService(makeConfigService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────
  // addWatermark
  // ──────────────────────────────────────────────────────────────

  describe('addWatermark()', () => {
    it('returns a Buffer when given a valid PDF', async () => {
      const pdfBuffer = await makeMinimalPdfBuffer();
      const result = await service.addWatermark(pdfBuffer, 'PREVIEW');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('adds content to the PDF (output is different from input)', async () => {
      const pdfBuffer = await makeMinimalPdfBuffer();
      const result = await service.addWatermark(pdfBuffer, 'PREVIEW');

      expect(result).not.toEqual(pdfBuffer);
    });

    it('handles multi-page PDFs without error', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      doc.addPage([300, 300]);
      doc.addPage([150, 400]);
      const pdfBuffer = Buffer.from(await doc.save());

      const result = await service.addWatermark(pdfBuffer, 'PREVIEW');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('produces a valid PDF that can be loaded after watermarking', async () => {
      const pdfBuffer = await makeMinimalPdfBuffer();
      const watermarked = await service.addWatermark(pdfBuffer, 'PREVIEW');

      const loaded = await PDFDocument.load(watermarked);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('works with custom watermark text', async () => {
      const pdfBuffer = await makeMinimalPdfBuffer();

      await expect(
        service.addWatermark(pdfBuffer, 'CONFIDENTIAL'),
      ).resolves.toBeInstanceOf(Buffer);
    });

    it('throws BadRequestException when given an invalid PDF buffer', async () => {
      const invalidBuffer = Buffer.from('not a valid pdf');

      await expect(
        service.addWatermark(invalidBuffer, 'PREVIEW'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException with descriptive message on invalid PDF', async () => {
      const invalidBuffer = Buffer.from('garbage data');

      await expect(
        service.addWatermark(invalidBuffer, 'PREVIEW'),
      ).rejects.toThrow('Invalid PDF buffer');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // convertDocxToPdf
  // ──────────────────────────────────────────────────────────────

  describe('convertDocxToPdf()', () => {
    const docxBuffer = Buffer.from('fake docx content');

    it('returns a Buffer containing the PDF on success', async () => {
      const fakePdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(fakePdfBytes.buffer),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.convertDocxToPdf(docxBuffer);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `${GOTENBERG_URL}/forms/libreoffice/convert`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends the DOCX buffer as multipart form data', async () => {
      const fakePdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(fakePdfBytes.buffer),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.convertDocxToPdf(docxBuffer);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.body).toBeInstanceOf(FormData);
    });

    it('throws ServiceUnavailableException when Gotenberg is unreachable', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(
          new TypeError('fetch failed'),
        ) as unknown as typeof fetch;

      await expect(service.convertDocxToPdf(docxBuffer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws GatewayTimeoutException on timeout', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      global.fetch = jest
        .fn()
        .mockRejectedValue(timeoutError) as unknown as typeof fetch;

      await expect(service.convertDocxToPdf(docxBuffer)).rejects.toThrow(
        GatewayTimeoutException,
      );
    });

    it('throws BadRequestException when Gotenberg returns 4xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: jest.fn().mockResolvedValue('Unsupported file format'),
      }) as unknown as typeof fetch;

      await expect(service.convertDocxToPdf(docxBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceUnavailableException when Gotenberg returns 5xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('Service unavailable'),
      }) as unknown as typeof fetch;

      await expect(service.convertDocxToPdf(docxBuffer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws BadRequestException with helpful message on 4xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad request'),
      }) as unknown as typeof fetch;

      await expect(service.convertDocxToPdf(docxBuffer)).rejects.toThrow(
        'Invalid document',
      );
    });
  });
});
