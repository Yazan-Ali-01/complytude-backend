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
  extractText(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<TextractResult>;
}

export const TEXTRACT_SERVICE = Symbol('TEXTRACT_SERVICE');
export const TEXTRACT_CLIENT = Symbol('TEXTRACT_CLIENT');
