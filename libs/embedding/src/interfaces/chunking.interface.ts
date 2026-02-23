export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

export interface ClauseInput {
  id: string;
  title: string;
  content: string;
  order: number;
  metadata?: Record<string, unknown> | null;
}

export interface ClauseChunk {
  content: string;
  index: number;
  tokenCount: number;
  clauseId: string;
  clauseTitle: string;
  clauseOrder: number;
  isPartial: boolean;
  partIndex?: number;
  totalParts?: number;
  metadata?: Record<string, unknown> | null;
}

export interface EmbeddingResult {
  embedding: number[];
  index: number;
  tokenCount: number;
}
