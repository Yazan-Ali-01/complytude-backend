import * as Joi from 'joi';
import { secretEnv } from './env-secret.schema';

export const databaseEnvSchema = {
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_NAME: Joi.string().required(),
  DB_APP_USER: Joi.string().required(),
  DB_APP_PASSWORD: secretEnv('DB_APP_PASSWORD', { min: 16 }),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
  DB_SSL_ENABLED: Joi.string()
    .valid('true', 'false', '1', '0')
    .default('false'),
};
