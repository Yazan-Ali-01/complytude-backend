import { PermanentError, RetryableError } from '@lib/queue';
import { OcrOperationLostError } from '../interfaces/ocr.interface';

/** Azure AI Document Intelligence REST API v4.0 (GA). */
const API_VERSION = '2024-11-30';
/** Text with paragraphs, titles and section headings; reads printed Arabic. */
const MODEL_ID = 'prebuilt-layout';
const REQUEST_TIMEOUT_MS = 60_000;

export type AnalyzeStatus =
  | 'notStarted'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface AnalyzeParagraph {
  /** `title`, `sectionHeading`, `pageHeader`, `pageFooter`, `pageNumber`, `footnote`, `formulaBlock`. */
  role?: string;
  content: string;
  boundingRegions?: { pageNumber: number }[];
  spans?: { offset: number; length: number }[];
}

export interface AnalyzePage {
  pageNumber: number;
  lines?: { content: string }[];
  words?: { content: string; confidence?: number }[];
}

export interface AnalyzeResult {
  content?: string;
  pages?: AnalyzePage[];
  paragraphs?: AnalyzeParagraph[];
}

export interface AnalyzeOperation {
  status: AnalyzeStatus;
  error?: { code?: string; message?: string };
  analyzeResult?: AnalyzeResult;
}

/**
 * The three calls ingestion makes: start an analysis of a PDF (sent as bytes, so nothing is
 * shared from storage), read its result, and delete the result once read. The service keeps
 * inputs and results for 24 hours otherwise.
 */
export class DocumentIntelligenceClient {
  constructor(
    private readonly endpoint: string,
    private readonly key: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Starts a billed analysis; returns its result ID. */
  async analyze(pdf: Uint8Array): Promise<string> {
    const response = await this.request('POST', `${MODEL_ID}:analyze`, {
      base64Source: Buffer.from(pdf).toString('base64'),
    });
    if (response.status !== 202) throw await this.failure(response, 'analyze');

    const location = response.headers.get('operation-location') ?? '';
    const resultId = /\/analyzeResults\/([^/?]+)/.exec(location)?.[1];
    if (!resultId) {
      throw new RetryableError(
        'Document Intelligence accepted the document but named no operation',
      );
    }
    return decodeURIComponent(resultId);
  }

  async getResult(resultId: string): Promise<AnalyzeOperation> {
    const response = await this.request(
      'GET',
      `${MODEL_ID}/analyzeResults/${encodeURIComponent(resultId)}`,
    );
    if (response.status === 404) {
      throw new OcrOperationLostError(
        `Document Intelligence has no result ${resultId} (expired or never started)`,
      );
    }
    if (!response.ok) throw await this.failure(response, 'get result');
    return (await response.json()) as AnalyzeOperation;
  }

  async deleteResult(resultId: string): Promise<void> {
    const response = await this.request(
      'DELETE',
      `${MODEL_ID}/analyzeResults/${encodeURIComponent(resultId)}`,
    );
    if (!response.ok && response.status !== 404) {
      throw await this.failure(response, 'delete result');
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    if (!this.endpoint || !this.key) {
      throw new PermanentError(
        'Document Intelligence is not configured: set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY',
      );
    }
    const url = `${this.endpoint.replace(/\/+$/, '')}/documentintelligence/documentModels/${path}?api-version=${API_VERSION}`;
    try {
      return await this.fetchFn(url, {
        method,
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RetryableError(
        `Document Intelligence ${method} ${path.split('/')[0]} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  private async failure(response: Response, operation: string): Promise<Error> {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const detail = [body?.error?.code, body?.error?.message]
      .filter(Boolean)
      .join(': ');
    const message = `Document Intelligence ${operation}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`;
    // The document itself was refused: a retry would send the same bytes
    if ([400, 413, 415].includes(response.status)) {
      return new PermanentError(message);
    }
    return new RetryableError(message);
  }
}
