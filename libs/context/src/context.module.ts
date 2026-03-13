import {
  DynamicModule,
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ClsMiddleware, ClsModule } from 'nestjs-cls';
import { TracingMiddleware } from './tracing.middleware';

export interface ContextModuleOptions {
  /**
   * When true, registers HTTP middleware that:
   *  - Seeds CLS with the Fastify-generated trace ID (req.id)
   *  - Assigns trace_id to the pino request-scoped logger
   *
   * Set to false for non-HTTP consumers (workers, CLI).
   */
  enableHttpTracing?: boolean;
}

@Global()
@Module({})
export class ContextModule implements NestModule {
  private static httpTracing = false;

  static forRoot(options: ContextModuleOptions = {}): DynamicModule {
    ContextModule.httpTracing = options.enableHttpTracing ?? false;

    return {
      module: ContextModule,
      imports: [
        ClsModule.forRoot({
          global: true,
        }),
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    if (ContextModule.httpTracing) {
      consumer.apply(ClsMiddleware, TracingMiddleware).forRoutes('*');
    }
  }
}
