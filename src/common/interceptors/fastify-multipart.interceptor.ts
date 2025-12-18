import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  mixin,
  Type,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { MulterLikeFile } from '../interfaces/multer-file.interface';

export interface FastifyMultipartOptions {
  jsonFields?: string[]; // Fields to JSON.parse (e.g., ['languages', 'fields', 'metadata'])
}

/**
 * Interceptor that parses multipart/form-data requests into request.body and request.file(s)
 * Enables DTO validation with class-validator for multipart requests
 *
 * @param options Configuration options for multipart parsing
 * @returns NestInterceptor class
 *
 * @example
 * ```typescript
 * @UseInterceptors(
 *   FastifyMultipartInterceptor({
 *     jsonFields: ['languages', 'fields', 'metadata'],
 *   })
 * )
 * async create(@Body() dto: CreateTemplateDto, @UploadedFile() file?: Multer.File) {
 *   // DTO validation works, file is attached to request
 * }
 * ```
 */
export function FastifyMultipartInterceptor(
  options: FastifyMultipartOptions = {},
): Type<NestInterceptor> {
  const { jsonFields = [] } = options;

  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<any>> {
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      try {
        // Check if request has multipart content
        const contentType = request.headers['content-type'];
        if (!contentType || !contentType.includes('multipart/form-data')) {
          return next.handle();
        }

        const body: Record<string, any> = {};

        // Parse all multipart parts
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            // Handle file part
            const multipartFile = part;

            // Convert file stream to buffer
            const buffer = await multipartFile.toBuffer();

            // Create Express-like file object
            const fileObject: MulterLikeFile = {
              fieldname: multipartFile.fieldname,
              originalname: multipartFile.filename,
              encoding: multipartFile.encoding,
              mimetype: multipartFile.mimetype,
              buffer: buffer,
              size: buffer.length,
            };

            // Handle multiple files with same field name
            const existingValue = body[multipartFile.fieldname];
            if (existingValue) {
              if (Array.isArray(existingValue)) {
                existingValue.push(fileObject);
              } else {
                body[multipartFile.fieldname] = [existingValue, fileObject];
              }
            } else {
              body[multipartFile.fieldname] = fileObject;
            }
          } else {
            // Handle field part
            const fieldname = part.fieldname;
            const value = (part as any).value as string;

            // Try to parse JSON fields
            if (jsonFields.includes(fieldname)) {
              try {
                body[fieldname] = JSON.parse(value);
              } catch {
                // If JSON parsing fails, use raw value
                // This allows validation to catch the error
                body[fieldname] = value;
              }
            } else {
              body[fieldname] = value;
            }
          }
        }

        // Attach parsed body to request for DTO validation
        request.body = body;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          `Failed to process multipart request: ${error.message}`,
        );
      }

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
