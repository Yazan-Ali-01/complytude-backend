import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  type Block,
  type TextractClient,
} from '@aws-sdk/client-textract';
import { PermanentError, RetryableError } from '@lib/queue';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TEXTRACT_CLIENT,
  type ITextractService,
  type TextractResult,
} from '../interfaces/textract.interface';

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

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

  async extractText(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<TextractResult> {
    this.validateMimeType(mimeType, key);

    const jobId = await this.startTextDetection(bucket, key);
    this.logger.log(
      `Textract job started: jobId=${jobId} bucket=${bucket} key=${key}`,
    );

    const blocks = await this.pollUntilComplete(jobId);

    return parseTextractBlocks(blocks, jobId, this.config.maxPages);
  }

  private validateMimeType(mimeType: string, key: string): void {
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new PermanentError(
        `Unsupported file type "${mimeType}" for Textract extraction (key=${key}). ` +
          `Supported: ${[...SUPPORTED_MIME_TYPES].join(', ')}`,
      );
    }
  }

  private async startTextDetection(
    bucket: string,
    key: string,
  ): Promise<string> {
    try {
      const response = await this.textractClient.send(
        new StartDocumentTextDetectionCommand({
          DocumentLocation: {
            S3Object: { Bucket: bucket, Name: key },
          },
        }),
      );

      if (!response.JobId) {
        throw new RetryableError(
          'Textract StartDocumentTextDetection returned no JobId',
        );
      }

      return response.JobId;
    } catch (error: unknown) {
      throw this.classifyAwsError(error, `StartDocumentTextDetection`);
    }
  }

  private async pollUntilComplete(jobId: string): Promise<Block[]> {
    const allBlocks: Block[] = [];
    let delay = this.config.pollInitialDelayMs;

    for (let attempt = 1; attempt <= this.config.pollMaxAttempts; attempt++) {
      await sleep(delay);

      const { status, blocks, nextToken, statusMessage } =
        await this.getDetectionResult(jobId, undefined);

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
        throw new RetryableError(
          `Textract job ${jobId} FAILED: ${statusMessage ?? 'unknown reason'}`,
        );
      }

      if (status === 'PARTIAL_SUCCESS') {
        this.logger.warn(
          `Textract job ${jobId} completed with PARTIAL_SUCCESS — some pages may have errors. Extracting available text.`,
        );
      }

      // SUCCEEDED or PARTIAL_SUCCESS — collect blocks from all pages
      allBlocks.push(...blocks);

      // Handle paginated results (large documents)
      let token = nextToken;
      while (token) {
        const page = await this.getDetectionResult(jobId, token);
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

  private async getDetectionResult(
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
        new GetDocumentTextDetectionCommand({
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
      throw this.classifyAwsError(error, `GetDocumentTextDetection`);
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
 * Parse Textract Blocks into concatenated plain text.
 *
 * 1. Filter to LINE blocks only
 * 2. Sort by page number, then vertical position (reading order)
 * 3. Concatenate with newlines between lines, double-newline between pages
 */
export function parseTextractBlocks(
  blocks: Block[],
  jobId: string,
  maxPages: number,
): TextractResult {
  const lineBlocks = blocks.filter((b) => b.BlockType === 'LINE');

  if (lineBlocks.length === 0) {
    return { text: '', pageCount: 0, confidence: 0, textractJobId: jobId };
  }

  const pages = new Set(lineBlocks.map((b) => b.Page ?? 1));
  const pageCount = pages.size;

  if (pageCount > maxPages) {
    throw new PermanentError(
      `Document has ${pageCount} pages, exceeding the maximum of ${maxPages}. ` +
        `Increase TEXTRACT_MAX_PAGES if this is expected.`,
    );
  }

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

  const sortedPages = [...textByPage.keys()].sort((a, b) => a - b);
  const text = sortedPages
    .map((page) => textByPage.get(page)!.join('\n'))
    .join('\n\n');

  const confidences = lineBlocks
    .filter((b) => b.Confidence != null)
    .map((b) => b.Confidence!);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

  return {
    text,
    pageCount,
    confidence: Math.round(avgConfidence * 100) / 100,
    textractJobId: jobId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
