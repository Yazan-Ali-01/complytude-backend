import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import { OcrOperationLostError } from '../interfaces/ocr.interface';
import { DocumentIntelligenceClient } from './document-intelligence.client';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { sectionsFromLayout } from './document-layout';

/**
 * Against a real Document Intelligence resource: `pnpm test:ocr-live`, with
 * AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and _KEY in the environment or apps/worker-ingestion/.env.
 * Skipped otherwise. One analysis of one page (billed).
 */
const LIVE = process.env.DOCUMENT_INTELLIGENCE_LIVE === '1';
const ENV_FILE = join(__dirname, '../../.env');
const SCAN = join(
  __dirname,
  '../../../../data/test-documents/arabic_scanned_page.png',
);

(LIVE ? describe : describe.skip)('Document Intelligence (live)', () => {
  beforeAll(() => {
    if (!existsSync(ENV_FILE)) return;
    // Jest gives each test file its own process.env, so the file is read into that one
    for (const [key, value] of Object.entries(
      parseEnv(readFileSync(ENV_FILE, 'utf8')),
    )) {
      process.env[key] ??= value;
    }
  });

  it('reads a scanned Arabic page, headings included, and deletes the result', async () => {
    const client = new DocumentIntelligenceClient(
      process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '',
      process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '',
    );
    const service = new DocumentIntelligenceService(
      client,
      new ConfigService({ ocr: { pollInitialDelayMs: 1000 } }),
    );
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(readFileSync(SCAN));
    pdf
      .addPage([595, 595])
      .drawImage(image, { x: 0, y: 0, width: 595, height: 595 });

    const operationId = await service.start(await pdf.save());
    const result = await service.collect(operationId);

    const { text, sections } = sectionsFromLayout(result.items);
    expect(result.pageCount).toBe(1);
    expect(text).toContain('18,000');
    expect(text).toMatch(/الموظف/);
    expect(sections.some((s) => s.heading && /الراتب/.test(s.heading))).toBe(
      true,
    );
    // Read once, then gone from the service
    await expect(client.getResult(operationId)).rejects.toBeInstanceOf(
      OcrOperationLostError,
    );
  }, 120_000);
});
