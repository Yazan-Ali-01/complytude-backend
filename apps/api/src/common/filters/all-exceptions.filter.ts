import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { toHttpErrorBody } from './http-error-response';

/**
 * Every error a route throws leaves in the one documented shape, with the request's trace id so a
 * user's report can be matched to the logs. Server faults are logged with their stack; the client
 * never sees it.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const i18n = I18nContext.current(host);

    const body = toHttpErrorBody(exception, request, (key) =>
      i18n ? i18n.t(key) : key,
    );

    const summary = `${request.method} ${request.url} → ${body.statusCode} [${body.traceId}]`;
    if (body.statusCode >= 500) {
      this.logger.error(
        `${summary}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${summary}: ${JSON.stringify(body.message)}`);
    }

    void reply.status(body.statusCode).send(body);
  }
}
