import * as Joi from 'joi';

export const redisEnvSchema = {
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_QUEUE_DB: Joi.number().default(1),
  REDIS_TLS: Joi.boolean().default(false),
  REDIS_KEY_PREFIX: Joi.string().default('complytude:'),
};
