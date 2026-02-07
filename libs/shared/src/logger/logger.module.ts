import { DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { LoggerModuleOptions } from './interfaces/logger-options.interface';
import { createPinoConfig } from './pino.config';

/**
 * Shared Logger Module for Complytude Platform
 *
 * Provides structured JSON logging with Pino for all applications (API Gateway, Workers).
 *
 * Features:
 * - NDJSON format for machine-readable logs
 * - Automatic request/response logging
 * - Distributed tracing with trace_id
 * - Tenant context injection
 * - Service identification
 * - Environment-based configuration (pretty-print in dev, NDJSON in production)
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { LoggerModule } from '@complytude/shared';
 *
 * @Module({
 *   imports: [
 *     LoggerModule.forRoot({
 *       serviceName: 'gateway',
 *       logLevel: 'info',
 *       prettyPrint: false,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * ```typescript
 * // In a service
 * import { Logger } from '@nestjs/common';
 *
 * @Injectable()
 * export class MyService {
 *   private readonly logger = new Logger(MyService.name);
 *
 *   doSomething() {
 *     this.logger.log('Doing something');
 *     this.logger.error('Something went wrong', error);
 *   }
 * }
 * ```
 */
@Global()
@Module({})
export class LoggerModule {
  /**
   * Configure the logger module with application-specific options
   *
   * @param options - Logger configuration options
   * @returns Dynamic module
   */
  static forRoot(options: LoggerModuleOptions): DynamicModule {
    const pinoConfig = createPinoConfig(options);

    return {
      module: LoggerModule,
      imports: [PinoLoggerModule.forRoot(pinoConfig)],
      exports: [PinoLoggerModule],
    };
  }

  /**
   * Configure the logger module asynchronously
   * Useful when configuration depends on ConfigService
   *
   * @example
   * ```typescript
   * LoggerModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (configService: ConfigService) => ({
   *     serviceName: configService.get('app.serviceName'),
   *     logLevel: configService.get('logging.level'),
   *     prettyPrint: configService.get('app.environment') === 'development',
   *   }),
   * })
   * ```
   */
  static forRootAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (
      ...args: any[]
    ) => LoggerModuleOptions | Promise<LoggerModuleOptions>;
  }): DynamicModule {
    return {
      module: LoggerModule,
      imports: [
        PinoLoggerModule.forRootAsync({
          imports: options.imports,
          inject: options.inject,
          useFactory: async (...args: any[]) => {
            const loggerOptions = await options.useFactory(...args);
            return createPinoConfig(loggerOptions);
          },
        }),

        ...(options.imports || []),
      ],
      exports: [PinoLoggerModule],
    };
  }
}
