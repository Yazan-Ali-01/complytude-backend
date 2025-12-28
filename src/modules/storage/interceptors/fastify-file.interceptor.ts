import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  mixin,
  Type,
} from '@nestjs/common';
import { BusinessException } from 'src/common/exceptions/business.exception';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';

export function FastifyFileInterceptor(
  _fieldName: string,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      try {
        const data = await request.file();

        if (!data) {
          throw new BusinessException(
            'storage.errors.noFileUploaded',
            HttpStatus.BAD_REQUEST,
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
        if (error instanceof BusinessException) {
          throw error;
        }
        throw new BusinessException(
          'storage.errors.uploadProcessingFailed',
          HttpStatus.BAD_REQUEST,
        );
      }

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
