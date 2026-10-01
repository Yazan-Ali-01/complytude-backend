import * as Joi from 'joi';
import {
  DEFAULT_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  OPENAI_BASE_URL_PATTERN,
} from './embedding.constants';

export const embeddingEnvSchema = {
  OPENAI_API_KEY: Joi.string().required(),
  // Shared by the embedding and chat clients; the SDK would otherwise read it unvalidated
  OPENAI_BASE_URL: Joi.string()
    .pattern(OPENAI_BASE_URL_PATTERN)
    .default(DEFAULT_OPENAI_BASE_URL)
    .messages({
      'string.pattern.base':
        '"OPENAI_BASE_URL" must be https://api.openai.com/v1 or an OpenAI data-residency host (https://us.api.openai.com/v1, https://eu.api.openai.com/v1, https://ae.api.openai.com/v1)',
    }),
  // Changing it means re-embedding the rulesets (pnpm rulesets:reingest): see migration 039
  OPENAI_EMBEDDING_MODEL: Joi.string().default(DEFAULT_MODEL),
  OPENAI_EMBEDDING_DIMENSIONS: Joi.number().default(1536),
  OPENAI_MAX_RETRIES: Joi.number().default(3),
  EMBEDDING_CHUNK_SIZE: Joi.number().default(512),
  EMBEDDING_CHUNK_OVERLAP: Joi.number().default(50),
};
