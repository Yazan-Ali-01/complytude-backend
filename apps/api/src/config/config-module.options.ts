import { databaseConfig } from '@lib/database';
import { redisConfig } from '@lib/redis';
import type { ConfigModuleOptions } from '@nestjs/config';
import appConfig from './app.config';
import { validationSchema } from './env.schema';
import geoConfig from './geo.config';
import jwtConfig from './jwt.config';
import sessionConfig from './session.config';
import ssoConfig from './sso.config';
import storageConfig from './storage.config';
import stripeConfig from './stripe.config';

/**
 * ConfigModule options shared by the HTTP app (AppModule) and the CLI commands, so both
 * validate the same environment.
 */
export const configModuleOptions: ConfigModuleOptions = {
  isGlobal: true,
  envFilePath: ['apps/api/.env'],
  // Tests are hermetic: they get their env from apps/api/.env.test (loaded by the Jest setup),
  // never from a developer's apps/api/.env.
  ignoreEnvFile: process.env.NODE_ENV === 'test',
  load: [
    databaseConfig,
    appConfig,
    jwtConfig,
    geoConfig,
    sessionConfig,
    storageConfig,
    stripeConfig,
    ssoConfig,
    redisConfig,
  ],
  validationSchema: validationSchema,
  validationOptions: {
    allowUnknown: true,
    abortEarly: false,
  },
};
