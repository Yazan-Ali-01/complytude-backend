import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  mixin,
  Type,
  BadRequestException,
} from '@nestjs/common';
import { I18nService, I18nContext } from 'nestjs-i18n';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';

export function FastifyFileInterceptor(
  _fieldName: string,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    constructor(private readonly i18n: I18nService) {}

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      try {
        const data = await request.file();

        if (!data) {
          throw new BadRequestException(
            this.i18n.t('storage.errors.noFileUploaded', {
              lang: I18nContext.current()?.lang,
            }),
          );
        }

        // Convert file stream to buffer
        const buffer = await data.toBuffer();

        // Attach file to request in Express-like format
        (request as any).file = {
          fieldname: data.fieldname,
          originalname: data.filename,
          encoding: data.encoding,
          mimetype: data.mimetype,
          buffer: buffer,
          size: buffer.length,
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          this.i18n.t('storage.errors.uploadProcessingFailed', {
            lang: I18nContext.current()?.lang,
          }),
        );
      }

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
