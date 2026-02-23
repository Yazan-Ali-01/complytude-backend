import * as Joi from 'joi';

export const embeddingEnvSchema = {
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: Joi.number().default(1536),
  OPENAI_MAX_RETRIES: Joi.number().default(3),
  EMBEDDING_CHUNK_SIZE: Joi.number().default(512),
  EMBEDDING_CHUNK_OVERLAP: Joi.number().default(50),
};
