export interface EmbeddingModuleConfig {
  apiKey: string;
  /** OpenAI API host; the global API or a data-residency host (OPENAI_BASE_URL). */
  baseURL?: string;
  model?: string;
  dimensions?: number;
  maxRetries?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}
