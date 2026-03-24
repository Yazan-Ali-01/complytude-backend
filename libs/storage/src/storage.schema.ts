import * as Joi from 'joi';

export const storageEnvSchema = {
  S3_ENDPOINT: Joi.string().allow('').default(''),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_SECRET_KEY: Joi.string().allow('').default(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),
  COMPLYTUDE_FILES_BUCKET_NAME: Joi.string().default('complytude-files'),
  TEMPLATES_BUCKET_NAME: Joi.string().default('complytude-templates'),
  QUARANTINE_BUCKET_NAME: Joi.string().default('complytude-quarantine'),
};
