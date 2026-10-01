export const EMBEDDING_MODULE_OPTIONS = 'EMBEDDING_MODULE_OPTIONS';

/** The UAE data-residency route offers only this model; DEFAULT_DIMENSIONS keeps vector(1536). */
export const DEFAULT_MODEL = 'text-embedding-3-large';
export const DEFAULT_DIMENSIONS = 1536;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_CHUNK_SIZE = 512;
export const DEFAULT_CHUNK_OVERLAP = 50;

export const MAX_INPUT_TOKENS = 8191;
/** OpenAI's limits per embeddings request: inputs, and tokens summed across them. */
export const MAX_BATCH_SIZE = 2048;
export const MAX_BATCH_TOKENS = 300_000;

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
/** OpenAI's global API or one of its data-residency hosts: no other endpoint may receive document text. */
export const OPENAI_BASE_URL_PATTERN =
  /^https:\/\/(?:(?:us|eu|ae)\.)?api\.openai\.com\/v1$/;

/**
 * Where OpenAI processes requests sent to `baseUrl`: the data-residency region of its host (`us`,
 * `eu`, `ae`), or `global` for api.openai.com.
 */
export function openAiRegion(baseUrl: string): string {
  const match = /^https:\/\/(?:(us|eu|ae)\.)?api\.openai\.com\//.exec(baseUrl);
  return match?.[1] ?? 'global';
}
