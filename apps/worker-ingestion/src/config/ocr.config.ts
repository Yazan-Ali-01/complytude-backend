import { registerAs } from '@nestjs/config';

export const ocrConfig = registerAs('ocr', () => ({
  endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '',
  key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '',
  maxPages: parseInt(process.env.DOCUMENT_MAX_PAGES ?? '50', 10),
  pollInitialDelayMs: parseInt(
    process.env.OCR_POLL_INITIAL_DELAY_MS ?? '2000',
    10,
  ),
  pollMaxDelayMs: parseInt(process.env.OCR_POLL_MAX_DELAY_MS ?? '30000', 10),
  pollMaxAttempts: parseInt(process.env.OCR_POLL_MAX_ATTEMPTS ?? '60', 10),
  pollBackoffMultiplier: parseFloat(
    process.env.OCR_POLL_BACKOFF_MULTIPLIER ?? '1.5',
  ),
  minTextCharsPerPage: parseInt(
    process.env.PDF_TEXT_MIN_CHARS_PER_PAGE ?? '50',
    10,
  ),
}));

export type OcrConfig = ReturnType<typeof ocrConfig>;
