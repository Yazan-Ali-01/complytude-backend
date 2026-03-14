import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { CLS_TRACE_ID } from './context.constants';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService,
    private readonly pinoLogger: PinoLogger,
  ) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const traceId = this.cls.get<string>(CLS_TRACE_ID);
    if (traceId) {
      try {
        this.pinoLogger.assign({ trace_id: traceId });
      } catch {
        // Route excluded from pino-http — no request-scoped logger available
      }
    }
    return next.handle();
  }
}
