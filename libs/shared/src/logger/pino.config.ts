import { Params } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';
import { LoggerModuleOptions } from './interfaces/logger-options.interface';

/**
 * Create Pino logger configuration for NestJS
 *
 * This configuration provides:
 * - Structured JSON logging (NDJSON format)
 * - Request correlation with trace_id
 * - Tenant context extraction from JWT
 * - Service identification
 * - Auto-logging of HTTP requests with intelligent filtering
 *
 * @param options - Logger module configuration options
 * @returns Pino configuration params
 */
export function createPinoConfig(options: LoggerModuleOptions): Params {
  const {
    serviceName,
    logLevel = 'info',
    prettyPrint = false,
    autoLogging = true,
    tenantExtractor,
  } = options;

  return {
    pinoHttp: {
      // Base logger configuration
      level: logLevel,

      // Base properties for all logs
      // Remove pid and hostname - not useful in containerized environments
      base: {
        service_name: serviceName,
        pid: undefined,
        hostname: undefined,
      },

      // Pretty print for development (human-readable)
      transport: prettyPrint
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              levelFirst: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: false,
              messageFormat: '{msg}',
            },
          }
        : undefined,

      // Base log formatting (production NDJSON)
      formatters: prettyPrint
        ? undefined
        : {
            level: (label: string) => {
              return { level: label };
            },
          },

      // Generate unique request ID for distributed tracing
      genReqId: (req: any) => {
        // Use existing x-request-id or x-trace-id header if present, otherwise generate new UUID
        // Supports W3C Trace Context and OpenTelemetry compatibility
        return (
          req.headers['x-request-id'] || req.headers['x-trace-id'] || uuidv4()
        );
      },

      // Custom properties injected into every log
      customProps: (req: any) => {
        const customProps: Record<string, any> = {
          trace_id: req.id, // Request correlation ID
        };

        // Extract tenant_id from JWT if authenticated
        if (tenantExtractor) {
          const tenantId = tenantExtractor(req);
          if (tenantId) {
            customProps.tenant_id = tenantId;
          }
        }

        // Alternative: Extract from request.auth.tenant (if available)
        if (req.auth?.tenant?.tenantId) {
          customProps.tenant_id = req.auth.tenant.tenantId;
          customProps.user_id = req.auth.tenant.userId;
        }

        return customProps;
      },

      // Redact sensitive fields from logs (OWASP compliance)
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.confirmPassword',
          'req.body.token',
          'req.query.token',
          'req.query.password',
        ],
        censor: '[REDACTED]',
      },

      // Auto-logging configurationn
      autoLogging: autoLogging
        ? {
            ignore: (req: { url?: string }) => {
              // Don't log health check endpoints (reduces noise)
              const ignoredPaths = ['/health', '/api/health', '/metrics', '/'];
              return ignoredPaths.includes(req.url ?? '');
            },
          }
        : false,

      // Custom success message for HTTP requests
      customSuccessMessage: (req: any) => {
        return `${req.method} ${req.url} completed`;
      },

      // Custom error message for HTTP requests
      customErrorMessage: (req: any, _res: any, error: Error) => {
        return `${req.method} ${req.url} failed: ${error.message}`;
      },

      // Serialize request (exclude sensitive data)
      serializers: {
        req: (req: any) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.ip,
          // Exclude sensitive headers (authorization, cookies)
          headers: {
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            accept: req.headers['accept'],
          },
        }),
        res: (res: any) => ({
          statusCode: res.statusCode,
          responseTime: res.responseTime,
        }),
        err: (err: any) => ({
          type: err.type || err.constructor?.name || 'Error',
          message: err.message,
          stack: err.stack,
          // Include HTTP status code if available (NestJS HttpException)
          statusCode: err.status || err.statusCode,
          // Include validation errors if present
          ...(err.response?.message && { details: err.response.message }),
        }),
      },
    },
  };
}

/**
 * Extract tenant ID from Fastify request
 * Used in API gateway where tenant context is available
 *
 * @param request - Fastify request object
 * @returns tenant_id or undefined
 */
export function extractTenantFromRequest(request: any): string | undefined {
  // Check if authenticated with tenant token
  if (request.auth?.tenant?.tenantId) {
    return request.auth.tenant.tenantId;
  }

  // Check if tenant context is set (from middleware/interceptor)
  if (request.tenantContext?.tenantId) {
    return request.tenantContext.tenantId;
  }

  return undefined;
}
