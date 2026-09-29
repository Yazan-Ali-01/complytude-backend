import * as Joi from 'joi';
import { secretEnv } from './env-secret.schema';

export const databaseEnvSchema = {
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_NAME: Joi.string().required(),
  DB_APP_USER: Joi.string().required(),
  DB_APP_PASSWORD: secretEnv('DB_APP_PASSWORD', { min: 16 }),
  // Per task; the sum over all tasks (x2 during a rolling deploy) must stay under RDS max_connections
  DB_MAX_CONNECTIONS: Joi.number().integer().min(1).default(10),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
  DB_STATEMENT_TIMEOUT: Joi.number().integer().min(1000).default(15000),
  DB_IDLE_IN_TRANSACTION_TIMEOUT: Joi.number()
    .integer()
    .min(1000)
    .default(30000),
  // TLS with a verified server certificate is required in production
  DB_SSL_ENABLED: Joi.string()
    .default('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid('true', '1').required().messages({
        'any.only': 'DB_SSL_ENABLED must be true when NODE_ENV=production',
        'any.required': 'DB_SSL_ENABLED must be true when NODE_ENV=production',
      }),
      otherwise: Joi.valid('true', 'false', '1', '0'),
    }),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.string()
    .default('true')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid('true', '1').messages({
        'any.only':
          'DB_SSL_REJECT_UNAUTHORIZED must not be false when NODE_ENV=production',
      }),
      otherwise: Joi.valid('true', 'false', '1', '0'),
    }),
  DB_SSL_CA_PATH: Joi.string().optional(),
};
