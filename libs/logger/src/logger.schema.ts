import * as Joi from 'joi';

export const loggerEnvSchema = {
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')
    .default('debug'),
  SERVICE_NAME: Joi.string().optional(),
};
