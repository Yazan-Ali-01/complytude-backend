import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RouteExclusion } from './interfaces/logger-options.interface';
import { PINO_REDACT_PATHS, REDACTED } from './logger.redaction';
import { getClientIp, isScannerPath, truncateIp } from './logger.utils';

type RequestLike = IncomingMessage & {
  id?: string;
  ip?: string;
  url?: string;
  query?: unknown;
};

type ResponseLike = ServerResponse & {
  getHeader?: (name: string) => unknown;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getHeader(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

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

      customProps: (req: RequestLike) => ({
        trace_id: req.id,
        service_name: serviceName,
      }),

      base: {
        service_name: serviceName,
        pid: undefined,
        hostname: undefined,
      },

      redact: {
        paths: [...PINO_REDACT_PATHS],
        censor: REDACTED,
      },

      // Map HTTP outcome to a meaningful pino level so dashboards can filter
      // failures by `level >= warn` instead of scraping every status code.
      // Scanner-path 404s are demoted to debug — silenced in prod where
      // LOG_LEVEL=info, kept available locally for triage.
      customLogLevel: (
        req: RequestLike,
        res: ResponseLike,
        err?: Error,
      ): 'info' | 'debug' | 'warn' | 'error' => {
        if (err) return 'error';
        const status = res.statusCode;
        if (status >= 500) return 'error';
        if (status === 404 && isScannerPath(req.url)) return 'debug';
        if (status >= 400) return 'warn';
        return 'info';
      },

      serializers: {
        req: (req: RequestLike) => ({
          method: req.method,
          url: req.url,
          query: req.query,
          host: getHeader(req, 'host'),
          referer: getHeader(req, 'referer') ?? getHeader(req, 'referrer'),
          userAgent: getHeader(req, 'user-agent'),
          // Stored truncated by default for privacy (compliance product).
          // Full client IP is available in ALB access logs when those are enabled.
          ip: truncateIp(getClientIp(req)),
          contentLength: asNumber(getHeader(req, 'content-length')),
        }),
        res: (res: ResponseLike) => ({
          statusCode: res.statusCode,
          contentLength: asNumber(res.getHeader?.('content-length')),
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
