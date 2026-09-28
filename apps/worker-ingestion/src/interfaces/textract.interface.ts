import { RetryableError } from '@lib/queue';

export interface DocumentSection {
  heading: string | null;
  level: number;
  content: string;
  pageStart: number;
}

export interface TextractResult {
  text: string;
  sections: DocumentSection[];
  pageCount: number;
  confidence?: number;
  textractJobId?: string;
}

export interface ITextractService {
  /** Checks the file (type, page limit) and starts a billed Textract job; returns its ID. */
  startAnalysis(bucket: string, key: string, mimeType: string): Promise<string>;
  /** Polls a started job to completion and parses it. */
  collectResult(jobId: string): Promise<TextractResult>;
}

/**
 * The Textract job itself failed or can no longer be read: retrying means starting a new job,
 * so the stored job ID must be cleared first.
 */
export class TextractJobFailedError extends RetryableError {}

export const TEXTRACT_SERVICE = Symbol('TEXTRACT_SERVICE');
export const TEXTRACT_CLIENT = Symbol('TEXTRACT_CLIENT');
