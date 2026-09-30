import { registerAs } from '@nestjs/config';
import { DEFAULT_OPENAI_BASE_URL } from './embedding.constants';

export default registerAs('embedding', () => ({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  dimensions: parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10),
  maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10),
  chunkSize: parseInt(process.env.EMBEDDING_CHUNK_SIZE || '512', 10),
  chunkOverlap: parseInt(process.env.EMBEDDING_CHUNK_OVERLAP || '50', 10),
}));
