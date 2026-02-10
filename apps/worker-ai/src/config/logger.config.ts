import { registerAs } from '@nestjs/config';

/**
 * Logger Configuration for AI Worker
 *
 * This configuration defines logging behavior for the AI processing worker.
 * Loaded via ConfigModule and consumed by LoggerModule.
 *
 * Environment Variables:
 * - LOG_LEVEL: Logging level (debug, info, warn, error)
 * - LOG_PRETTY: Enable pretty-printing for development
 * - SERVICE_NAME: Service identifier for structured logs
 *
 * @see libs/shared/src/logger/README.md for detailed logging documentation
 */
export default registerAs('logger', () => ({
  /**
   * Service name identifier
   * Used in structured logs to identify which service generated the log
   * @default 'worker-ai'
   */
  serviceName: process.env.SERVICE_NAME || 'worker-ai',

  /**
   * Log level (trace, debug, info, warn, error, fatal)
   * @default 'info' in production, 'debug' in development
   */
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  /**
   * Enable pretty-printing for development
   * @default false in production, true in development
   */
  prettyPrint:
    process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV === 'development',

  /**
   * Enable auto-logging of HTTP requests
   * @default true
   */
  autoLogging: process.env.LOG_AUTO_LOGGING !== 'false',
}));
