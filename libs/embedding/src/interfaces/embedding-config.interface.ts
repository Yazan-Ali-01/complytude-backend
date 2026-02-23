export interface EmbeddingModuleConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  maxRetries?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}
