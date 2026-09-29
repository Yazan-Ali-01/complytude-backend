import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Catches any exception thrown during SSO callback processing (guard or handler)
 * and redirects the browser to the frontend error page instead of returning JSON.
 */
@Catch()
@Injectable()
export class SsoCallbackExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SsoCallbackExceptionFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const provider = request.url.includes('google') ? 'google' : 'microsoft';
    const reason =
      exception instanceof HttpException
        ? exception.message
        : 'unexpected_error';

    this.logger.warn(
      `SSO callback error (${provider}): ${exception instanceof Error ? exception.message : String(exception)}`,
    );

    const frontendUrl = this.configService
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    const errorPath =
      this.configService.get<string>('sso.frontendErrorPath') ?? '/auth/error';
    const params = new URLSearchParams({ sso: 'error', provider, reason });

    // Explicit 302: a status set before the error (Nest sets 200) would otherwise be kept
    void reply.redirect(`${frontendUrl}${errorPath}?${params.toString()}`, 302);
  }
}
