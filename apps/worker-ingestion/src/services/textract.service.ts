import {
  GetDocumentAnalysisCommand,
  StartDocumentAnalysisCommand,
  type Block,
  type TextractClient,
} from '@aws-sdk/client-textract';
import { countPdfPages, UnreadablePdfError } from '@lib/pdf';
import { PermanentError, RetryableError } from '@lib/queue';
import { S3Service } from '@lib/storage';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TEXTRACT_CLIENT,
  type DocumentSection,
  type ITextractService,
  type TextractResult,
  TextractJobFailedError,
} from '../interfaces/textract.interface';

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

// LAYOUT block types to skip (page furniture, not document content)
const SKIP_LAYOUT_TYPES = new Set([
  'LAYOUT_HEADER',
  'LAYOUT_FOOTER',
  'LAYOUT_PAGE_NUMBER',
  'LAYOUT_FIGURE',
]);

// LAYOUT block types that start a new section
const HEADING_LAYOUT_TYPES = new Set(['LAYOUT_TITLE', 'LAYOUT_SECTION_HEADER']);

interface TextractPollingConfig {
  maxPages: number;
  pollInitialDelayMs: number;
  pollMaxDelayMs: number;
  pollMaxAttempts: number;
  pollBackoffMultiplier: number;
}

@Injectable()
export class TextractService implements ITextractService {
  private readonly logger = new Logger(TextractService.name);
  private readonly config: TextractPollingConfig;

  constructor(
    @Inject(TEXTRACT_CLIENT)
    private readonly textractClient: TextractClient,
    private readonly s3: S3Service,
    configService: ConfigService,
  ) {
    this.config = {
      maxPages: configService.get<number>('textract.maxPages', 50),
      pollInitialDelayMs: configService.get<number>(
        'textract.pollInitialDelayMs',
        2000,
      ),
      pollMaxDelayMs: configService.get<number>(
        'textract.pollMaxDelayMs',
        30000,
      ),
      pollMaxAttempts: configService.get<number>(
        'textract.pollMaxAttempts',
        60,
      ),
      pollBackoffMultiplier: configService.get<number>(
        'textract.pollBackoffMultiplier',
        1.5,
      ),
    };
  }

  /**
   * Starts (and so pays for) a Textract job, after checking the file type and, for a PDF, that
   * its page count is within TEXTRACT_MAX_PAGES: Textract bills every page it analyses, so the
   * limit must hold before the job, not after.
   */
  async startAnalysis(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<string> {
    this.validateMimeType(mimeType, key);
    if (mimeType === 'application/pdf') {
      await this.assertWithinPageLimit(bucket, key);
    }

    const jobId = await this.startDocumentAnalysis(bucket, key);
    this.logger.log(
      `Textract LAYOUT job started: jobId=${jobId} bucket=${bucket} key=${key}`,
    );
    return jobId;
  }

  /** Waits for a started job and parses its result; a failed or unknown job can't be resumed. */
  async collectResult(jobId: string): Promise<TextractResult> {
    const blocks = await this.pollUntilComplete(jobId);
    return parseLayoutBlocks(blocks, jobId, this.config.maxPages);
  }

  private async assertWithinPageLimit(
    bucket: string,
    key: string,
  ): Promise<void> {
    const pdf = await this.s3
      .getObjectBuffer(bucket, key)
      .catch((err: unknown) => {
        throw new RetryableError(
          `Could not read ${key} to count its pages`,
          err instanceof Error ? err : undefined,
        );
      });
    let pages: number;
    try {
      pages = await countPdfPages(pdf);
    } catch (error) {
      if (error instanceof UnreadablePdfError) {
        throw new PermanentError(`${key}: ${error.message}`);
      }
      throw error;
    }
    if (pages > this.config.maxPages) {
      throw new PermanentError(
        `Document has ${pages} pages, exceeding the maximum of ${this.config.maxPages}. ` +
          `Increase TEXTRACT_MAX_PAGES if this is expected.`,
      );
    }
  }

  private validateMimeType(mimeType: string, key: string): void {
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new PermanentError(
        `Unsupported file type "${mimeType}" for Textract extraction (key=${key}). ` +
          `Supported: ${[...SUPPORTED_MIME_TYPES].join(', ')}`,
      );
    }
  }

  private async startDocumentAnalysis(
    bucket: string,
    key: string,
  ): Promise<string> {
    try {
      const response = await this.textractClient.send(
        new StartDocumentAnalysisCommand({
          DocumentLocation: {
            S3Object: { Bucket: bucket, Name: key },
          },
          FeatureTypes: ['LAYOUT'],
        }),
      );

      if (!response.JobId) {
        throw new RetryableError(
          'Textract StartDocumentAnalysis returned no JobId',
        );
      }

      return response.JobId;
    } catch (error: unknown) {
      throw this.classifyAwsError(error, `StartDocumentAnalysis`);
    }
  }

  private async pollUntilComplete(jobId: string): Promise<Block[]> {
    const allBlocks: Block[] = [];
    let delay = this.config.pollInitialDelayMs;

    for (let attempt = 1; attempt <= this.config.pollMaxAttempts; attempt++) {
      await sleep(delay);

      const { status, blocks, nextToken, statusMessage } =
        await this.getAnalysisResult(jobId, undefined);

      if (status === 'IN_PROGRESS') {
        if (attempt % 5 === 0) {
          this.logger.log(
            `Textract job ${jobId} still IN_PROGRESS — attempt ${attempt}/${this.config.pollMaxAttempts}, next delay ${delay}ms`,
          );
        }
        delay = Math.min(
          delay * this.config.pollBackoffMultiplier,
          this.config.pollMaxDelayMs,
        );
        continue;
      }

      if (status === 'FAILED') {
        throw new TextractJobFailedError(
          `Textract job ${jobId} FAILED: ${statusMessage ?? 'unknown reason'}`,
        );
      }

      if (status === 'PARTIAL_SUCCESS') {
        this.logger.warn(
          `Textract job ${jobId} completed with PARTIAL_SUCCESS — some pages may have errors. Extracting available text.`,
        );
      }

      allBlocks.push(...blocks);

      let token = nextToken;
      while (token) {
        const page = await this.getAnalysisResult(jobId, token);
        allBlocks.push(...page.blocks);
        token = page.nextToken;
      }

      this.logger.log(
        `Textract job ${jobId} completed: status=${status} blocks=${allBlocks.length} attempts=${attempt}`,
      );

      return allBlocks;
    }

    throw new RetryableError(
      `Textract job ${jobId} did not complete within ${this.config.pollMaxAttempts} poll attempts`,
    );
  }

  private async getAnalysisResult(
    jobId: string,
    nextToken: string | undefined,
  ): Promise<{
    status: string;
    blocks: Block[];
    nextToken: string | undefined;
    statusMessage: string | undefined;
  }> {
    try {
      const response = await this.textractClient.send(
        new GetDocumentAnalysisCommand({
          JobId: jobId,
          NextToken: nextToken,
        }),
      );

      return {
        status: response.JobStatus ?? 'UNKNOWN',
        blocks: response.Blocks ?? [],
        nextToken: response.NextToken,
        statusMessage: response.StatusMessage,
      };
    } catch (error: unknown) {
      // Expired or unknown job: a retry has to start a new one
      if (error instanceof Error && error.name === 'InvalidJobIdException') {
        throw new TextractJobFailedError(
          `Textract job ${jobId} can't be resumed: ${error.message}`,
        );
      }
      throw this.classifyAwsError(error, `GetDocumentAnalysis`);
    }
  }

  private classifyAwsError(error: unknown, operation: string): Error {
    if (error instanceof PermanentError || error instanceof RetryableError) {
      return error;
    }

    const name = error instanceof Error ? error.name : '';
    const message =
      error instanceof Error ? error.message : 'Unknown Textract error';

    switch (name) {
      case 'InvalidS3ObjectException':
      case 'UnsupportedDocumentException':
      case 'DocumentTooLargeException':
      case 'BadDocumentException':
        return new PermanentError(`Textract ${operation}: ${message}`);

      case 'ProvisionedThroughputExceededException':
      case 'ThrottlingException':
      case 'InternalServerError':
      case 'LimitExceededException':
        return new RetryableError(`Textract ${operation}: ${message}`);

      default:
        return new RetryableError(
          `Textract ${operation} unexpected error: ${message}`,
          error instanceof Error ? error : undefined,
        );
    }
  }
}

/**
 * Parse Textract blocks from a LAYOUT-featured analysis job into structured sections
 * and a flat text fallback.
 *
 * LAYOUT blocks (LAYOUT_SECTION_HEADER, LAYOUT_TEXT, etc.) carry spatial hierarchy.
 * Each LAYOUT block's text is resolved by following CHILD relationships to LINE blocks.
 * Sections are delimited by LAYOUT_TITLE and LAYOUT_SECTION_HEADER blocks.
 *
 * Falls back to LINE-block concatenation when no LAYOUT blocks are returned
 * (e.g. image-only PDFs where LAYOUT feature produced nothing).
 */
export function parseLayoutBlocks(
  blocks: Block[],
  jobId: string,
  maxPages: number,
): TextractResult {
  const pageCount = new Set(blocks.map((b) => b.Page ?? 1)).size;

  if (pageCount > maxPages) {
    throw new PermanentError(
      `Document has ${pageCount} pages, exceeding the maximum of ${maxPages}. ` +
        `Increase TEXTRACT_MAX_PAGES if this is expected.`,
    );
  }

  // Build ID → block lookup for resolving CHILD relationships
  const blockMap = new Map<string, Block>();
  for (const block of blocks) {
    if (block.Id) blockMap.set(block.Id, block);
  }

  const getBlockText = (block: Block): string => {
    const childIds =
      block.Relationships?.filter((r) => r.Type === 'CHILD')?.flatMap(
        (r) => r.Ids ?? [],
      ) ?? [];

    return childIds
      .map((id) => blockMap.get(id))
      .filter((b): b is Block => b?.BlockType === 'LINE' && !!b.Text)
      .map((b) => b.Text!)
      .join(' ')
      .trim();
  };

  const layoutBlocks = blocks
    .filter((b) => b.BlockType?.startsWith('LAYOUT_'))
    .sort((a, b) => {
      const pageDiff = (a.Page ?? 1) - (b.Page ?? 1);
      if (pageDiff !== 0) return pageDiff;
      return (
        (a.Geometry?.BoundingBox?.Top ?? 0) -
        (b.Geometry?.BoundingBox?.Top ?? 0)
      );
    });

  // Compute confidence from LINE blocks (available regardless of LAYOUT)
  const lineBlocks = blocks.filter((b) => b.BlockType === 'LINE');
  const confidences = lineBlocks
    .filter((b) => b.Confidence != null)
    .map((b) => b.Confidence!);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
  const confidence = Math.round(avgConfidence * 100) / 100;

  // Fallback: no LAYOUT blocks (scanned image without LAYOUT output)
  if (layoutBlocks.length === 0) {
    const text = flattenLineBlocks(lineBlocks);
    return { text, sections: [], pageCount, confidence, textractJobId: jobId };
  }

  // Group content under section headings
  const sections: DocumentSection[] = [];
  let current: {
    heading: string | null;
    level: number;
    lines: string[];
    pageStart: number;
  } = { heading: null, level: 1, lines: [], pageStart: 1 };

  for (const block of layoutBlocks) {
    const type = block.BlockType!;
    if (SKIP_LAYOUT_TYPES.has(type)) continue;

    const text = getBlockText(block);
    if (!text) continue;

    if (HEADING_LAYOUT_TYPES.has(type)) {
      if (current.lines.length > 0 || current.heading !== null) {
        sections.push({
          heading: current.heading,
          level: current.level,
          content: current.lines.join('\n'),
          pageStart: current.pageStart,
        });
      }
      current = {
        heading: text,
        level: type === 'LAYOUT_TITLE' ? 0 : 1,
        lines: [],
        pageStart: block.Page ?? 1,
      };
    } else {
      current.lines.push(text);
    }
  }

  if (current.lines.length > 0 || current.heading !== null) {
    sections.push({
      heading: current.heading,
      level: current.level,
      content: current.lines.join('\n'),
      pageStart: current.pageStart,
    });
  }

  // Build flat text from sections for backward compat (documents.content column)
  const text = sections
    .map((s) => (s.heading ? `${s.heading}\n${s.content}` : s.content))
    .filter(Boolean)
    .join('\n\n');

  return { text, sections, pageCount, confidence, textractJobId: jobId };
}

function flattenLineBlocks(lineBlocks: Block[]): string {
  lineBlocks.sort((a, b) => {
    const pageDiff = (a.Page ?? 1) - (b.Page ?? 1);
    if (pageDiff !== 0) return pageDiff;
    return (
      (a.Geometry?.BoundingBox?.Top ?? 0) - (b.Geometry?.BoundingBox?.Top ?? 0)
    );
  });

  const textByPage = new Map<number, string[]>();
  for (const block of lineBlocks) {
    const page = block.Page ?? 1;
    if (!textByPage.has(page)) textByPage.set(page, []);
    if (block.Text) textByPage.get(page)!.push(block.Text);
  }

  return [...textByPage.keys()]
    .sort((a, b) => a - b)
    .map((page) => textByPage.get(page)!.join('\n'))
    .join('\n\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
