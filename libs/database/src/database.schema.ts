import * as Joi from 'joi';

export const databaseEnvSchema = {
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_NAME: Joi.string().required(),
  DB_APP_USER: Joi.string().required(),
  DB_APP_PASSWORD: Joi.string().required(),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),
  DB_SSL_ENABLED: Joi.string()
    .valid('true', 'false', '1', '0')
    .default('false'),
};
