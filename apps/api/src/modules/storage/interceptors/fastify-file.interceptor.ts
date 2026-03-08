import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  mixin,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { Observable } from 'rxjs';
import type { MulterLikeFile } from 'src/common/interfaces/multer-file.interface';
import { StorageI18n } from '../constants/i18n.constants';

export function FastifyFileInterceptor(
  _fieldName: string,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const i18n = I18nContext.current();
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      try {
        const data = await request.file();

        if (!data) {
          throw new BadRequestException(
            i18n?.t(StorageI18n.errors.FILE_UPLOAD_FAILED) ??
              'Failed to process file upload',
          );
        }

        // Convert file stream to buffer
        const buffer = await data.toBuffer();

        // Attach file to request in Express-like format (augment FastifyRequest)
        const fileObj: MulterLikeFile = {
          fieldname: data.fieldname,
          originalname: data.filename,
          encoding: data.encoding,
          mimetype: data.mimetype,
          buffer: buffer,
          size: buffer.length,
        };
        Object.defineProperty(request, 'file', {
          value: fileObj,
          writable: true,
          configurable: true,
        });
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          i18n?.t(StorageI18n.errors.FILE_UPLOAD_FAILED) ??
            'Failed to process file upload',
        );
      }

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
