import { RetryableError } from '@lib/queue';
import type { LayoutItem } from '../services/document-layout';

export interface DocumentSection {
  heading: string | null;
  level: number;
  content: string;
  pageStart: number;
}

export interface OcrResult {
  /** The pages' blocks in reading order, numbered by the pages of the file OCR read. */
  items: LayoutItem[];
  pageCount: number;
  /** Mean word confidence, 0–1. */
  confidence?: number;
}

export interface IOcrService {
  /** Sends a PDF to OCR (a billed operation) and returns the operation's ID. */
  start(pdf: Uint8Array): Promise<string>;
  /** Waits for a started operation, parses its result, then deletes it at the provider. */
  collect(operationId: string): Promise<OcrResult>;
}

/**
 * The OCR operation itself failed, or its result is gone (results expire after 24 hours):
 * retrying means starting a new one, so the stored operation ID must be cleared first.
 */
export class OcrOperationLostError extends RetryableError {}

export const OCR_SERVICE = Symbol('OCR_SERVICE');
export const DOCUMENT_INTELLIGENCE_CLIENT = Symbol(
  'DOCUMENT_INTELLIGENCE_CLIENT',
);
