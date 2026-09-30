import { RetryableError } from '@lib/queue';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DOCUMENT_INTELLIGENCE_CLIENT,
  type IOcrService,
  type OcrResult,
  OcrOperationLostError,
} from '../interfaces/ocr.interface';
import type {
  AnalyzeResult,
  DocumentIntelligenceClient,
} from './document-intelligence.client';
import type { LayoutItem } from './document-layout';

// Paragraph roles that are page furniture, not document content
const FURNITURE_ROLES = new Set(['pageHeader', 'pageFooter', 'pageNumber']);

interface PollingConfig {
  pollInitialDelayMs: number;
  pollMaxDelayMs: number;
  pollMaxAttempts: number;
  pollBackoffMultiplier: number;
}

/** OCR of scanned pages with Azure AI Document Intelligence (`prebuilt-layout`). */
@Injectable()
export class DocumentIntelligenceService implements IOcrService {
  private readonly logger = new Logger(DocumentIntelligenceService.name);
  private readonly config: PollingConfig;

  constructor(
    @Inject(DOCUMENT_INTELLIGENCE_CLIENT)
    private readonly client: DocumentIntelligenceClient,
    configService: ConfigService,
  ) {
    this.config = {
      pollInitialDelayMs: configService.get<number>(
        'ocr.pollInitialDelayMs',
        2000,
      ),
      pollMaxDelayMs: configService.get<number>('ocr.pollMaxDelayMs', 30000),
      pollMaxAttempts: configService.get<number>('ocr.pollMaxAttempts', 60),
      pollBackoffMultiplier: configService.get<number>(
        'ocr.pollBackoffMultiplier',
        1.5,
      ),
    };
  }

  async start(pdf: Uint8Array): Promise<string> {
    const operationId = await this.client.analyze(pdf);
    this.logger.log(
      `Document Intelligence analysis started: operation=${operationId} bytes=${pdf.byteLength}`,
    );
    return operationId;
  }

  /** Polls to completion, parses, then deletes the result so it isn't kept for 24 hours. */
  async collect(operationId: string): Promise<OcrResult> {
    const result = parseLayoutResult(await this.pollUntilComplete(operationId));
    await this.client.deleteResult(operationId).catch((err: unknown) => {
      this.logger.warn(
        `Could not delete Document Intelligence result ${operationId}; the service drops it after 24 hours: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return result;
  }

  private async pollUntilComplete(operationId: string): Promise<AnalyzeResult> {
    let delay = this.config.pollInitialDelayMs;

    for (let attempt = 1; attempt <= this.config.pollMaxAttempts; attempt++) {
      await sleep(delay);
      const operation = await this.client.getResult(operationId);

      if (operation.status === 'succeeded') {
        this.logger.log(
          `Document Intelligence analysis ${operationId} succeeded: pages=${operation.analyzeResult?.pages?.length ?? 0} attempts=${attempt}`,
        );
        return operation.analyzeResult ?? {};
      }
      if (operation.status === 'failed' || operation.status === 'canceled') {
        const reason = [operation.error?.code, operation.error?.message]
          .filter(Boolean)
          .join(': ');
        throw new OcrOperationLostError(
          `Document Intelligence analysis ${operationId} ${operation.status}${reason ? `: ${reason}` : ''}`,
        );
      }

      if (attempt % 5 === 0) {
        this.logger.log(
          `Document Intelligence analysis ${operationId} still ${operation.status}: attempt ${attempt}/${this.config.pollMaxAttempts}, next delay ${delay}ms`,
        );
      }
      delay = Math.min(
        delay * this.config.pollBackoffMultiplier,
        this.config.pollMaxDelayMs,
      );
    }

    throw new RetryableError(
      `Document Intelligence analysis ${operationId} did not complete within ${this.config.pollMaxAttempts} polls`,
    );
  }
}

/**
 * A `prebuilt-layout` result → the pages' blocks in reading order (the order of the result's
 * content). Titles and section headings become headings; page headers, footers and numbers are
 * dropped. Without paragraphs, each page's lines become one paragraph.
 */
export function parseLayoutResult(result: AnalyzeResult): OcrResult {
  const pages = result.pages ?? [];
  const confidences = pages
    .flatMap((p) => p.words ?? [])
    .map((w) => w.confidence)
    .filter((c): c is number => typeof c === 'number');
  const confidence =
    confidences.length > 0
      ? Math.round(
          (confidences.reduce((sum, c) => sum + c, 0) / confidences.length) *
            100,
        ) / 100
      : undefined;

  const paragraphs = (result.paragraphs ?? [])
    .map((p) => ({
      ...p,
      page: p.boundingRegions?.[0]?.pageNumber ?? 1,
      offset: p.spans?.[0]?.offset ?? 0,
    }))
    .sort((a, b) => a.page - b.page || a.offset - b.offset);

  if (paragraphs.length === 0) {
    const items: LayoutItem[] = pages
      .map((page) => ({
        kind: 'text' as const,
        text: (page.lines ?? []).map((l) => l.content).join('\n'),
        page: page.pageNumber,
      }))
      .filter((item) => item.text.trim())
      .sort((a, b) => a.page - b.page);
    return { items, pageCount: pages.length, confidence };
  }

  const items: LayoutItem[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.role && FURNITURE_ROLES.has(paragraph.role)) continue;
    const text = paragraph.content.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    items.push({
      kind:
        paragraph.role === 'title'
          ? 'title'
          : paragraph.role === 'sectionHeading'
            ? 'heading'
            : 'text',
      text,
      page: paragraph.page,
    });
  }
  return { items, pageCount: pages.length, confidence };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
