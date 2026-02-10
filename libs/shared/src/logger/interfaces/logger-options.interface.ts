/**
 * Logger Module Options Interface
 * Defines configuration options for the shared LoggerModule
 */
export interface LoggerModuleOptions {
  /**
   * Service name identifier (e.g., 'gateway', 'worker-ai', 'worker-ingestion')
   * Used in structured logs for service identification
   */
  serviceName: string;

  /**
   * Log level (trace, debug, info, warn, error, fatal)
   * @default 'info'
   */
  logLevel?: string;

  /**
   * Enable pretty printing for development
   * @default false (production uses NDJSON)
   */
  prettyPrint?: boolean;

  /**
   * Enable auto-logging of HTTP requests
   * @default true
   */
  autoLogging?: boolean;

  /**
   * Custom function to extract tenant_id from request
   * @param request - The incoming request object
   * @returns tenant_id or undefined
   */
  tenantExtractor?: (request: any) => string | undefined;
}

/**
 * Pino HTTP Configuration Options
 * Extended from pino-http configuration
 */
export interface PinoHttpOptions {
  /**
   * Enable automatic request/response logging
   * @default true
   */
  autoLogging?:
    | boolean
    | {
        /**
         * Function to determine if request should be logged
         */
        ignore?: (req: any) => boolean;
      };

  /**
   * Custom request ID generator
   */
  genReqId?: (req: any) => string;

  /**
   * Custom properties to add to each log
   */
  customProps?: (req: any, res: any) => Record<string, any>;

  /**
   * Custom success message formatter
   */
  customSuccessMessage?: (req: any, res: any) => string;

  /**
   * Custom error message formatter
   */
  customErrorMessage?: (req: any, res: any, error: Error) => string;
}
