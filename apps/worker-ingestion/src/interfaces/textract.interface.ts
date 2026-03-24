export interface TextractResult {
  text: string;
  pageCount?: number;
  confidence?: number;
}

export interface ITextractService {
  extractText(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<TextractResult>;
}

export const TEXTRACT_SERVICE = Symbol('TEXTRACT_SERVICE');
