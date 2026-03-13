import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { CLS_TRACE_ID } from './context.constants';

@Injectable()
export class TracingMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly pinoLogger: PinoLogger,
  ) {}

  use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void) {
    const traceId = (req as unknown as FastifyRequest).id;
    this.cls.set(CLS_TRACE_ID, traceId);
    this.pinoLogger.assign({ trace_id: traceId });
    next();
  }
}
