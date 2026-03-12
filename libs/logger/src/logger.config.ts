import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';

import type { RouteExclusion } from './interfaces/logger-options.interface';

export function createPinoConfig(
  configService: ConfigService,
  defaultServiceName: string,
  excludeRoutes?: RouteExclusion[],
): Params {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isDev = nodeEnv !== 'production';
  const logLevel = configService.get<string>(
    'LOG_LEVEL',
    isDev ? 'debug' : 'info',
  );
  const serviceName = configService.get<string>(
    'SERVICE_NAME',
    defaultServiceName,
  );

  return {
    ...(excludeRoutes ? { exclude: excludeRoutes } : {}),
    pinoHttp: {
      level: logLevel,

      customProps: (req: IncomingMessage & { id?: string }) => ({
        trace_id: req.id,
        service_name: serviceName,
      }),

      base: {
        service_name: serviceName,
        pid: undefined,
        hostname: undefined,
      },

      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
        ],
        censor: '[REDACTED]',
      },

      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          query: req.query,
        }),
      },

      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    },
  };
}
