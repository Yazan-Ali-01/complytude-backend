import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Logger,
  mixin,
  Type,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { StorageI18n } from 'src/modules/storage/constants/i18n.constants';
import { Observable } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { MulterLikeFile } from '../interfaces/multer-file.interface';
import { JSON_FIELDS_KEY } from '../decorators/json-field.decorator';
import { Reflector } from '@nestjs/core';

const logger = new Logger('FastifyMultipartInterceptor');

/**
 * Interceptor that parses multipart/form-data requests into request.body and request.file(s)
 * Enables DTO validation with class-validator for multipart requests
 *
 *
 * **JSON Field Parsing:** You must use `@JsonField()` decorator on any DTO field that should be
 * parsed as JSON (e.g., objects, arrays, records). Fields without `@JsonField()` will be treated
 * as plain strings. For example, if you have a `fields` property that should be an array of objects,
 * or a `metadata` property that should be a record, you must decorate them with `@JsonField()`.
 *
 * **JSON Parsing Behavior:** If JSON parsing fails for a field marked with `@JsonField()`,
 * the raw string value is passed to the DTO, allowing class-validator to catch and report
 * the validation error appropriately.
 *
 * **Multiple Files:** If multiple files are uploaded with the same field name, they will be
 * collected into an array in the request body.
 *
 * @returns NestInterceptor class
 *
 * @example
 * ```typescript
 * // In your DTO:
 * class CreateTemplateDto {
 *   @JsonField()
 *   fields: TemplateField[]; // Will be parsed as JSON array
 *
 *   @JsonField()
 *   metadata: Record<string, any>; // Will be parsed as JSON object
 *
 *   name: string; // Plain string, no parsing needed
 * }
 *
 * // In your controller:
 * @Post()
 * @UseInterceptors(FastifyMultipartInterceptor(CreateTemplateDto))
 * async create(@Body() dto: CreateTemplateDto) {
 *   // DTO validation works, file is attached to request.body.file
 *   // JSON fields (marked with @JsonField()) are automatically parsed
 * }
 * ```
 */
export function FastifyMultipartInterceptor(
  dtoClass: new () => object,
): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    constructor(private reflector: Reflector) {}

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const request = context.switchToHttp().getRequest<FastifyRequest>();

      try {
        // Check if request has multipart content
        const contentType = request.headers['content-type'];
        if (!contentType || !contentType.includes('multipart/form-data')) {
          return next.handle();
        }

        const body: Record<string, unknown> = {};

        const jsonFields: string[] =
          (dtoClass &&
            typeof dtoClass === 'function' &&
            Reflect.getMetadata(JSON_FIELDS_KEY, dtoClass)) ||
          [];

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
            const value = (part as { value: string }).value;

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
        // The parser's own text stays in the log
        logger.warn(`Failed to process multipart request: ${error.message}`);
        throw new BadRequestException(
          I18nContext.current()?.t(
            StorageI18n.errors.FAILED_TO_PROCESS_FILE_UPLOAD,
          ) ?? 'Failed to process file upload',
        );
      }

      return next.handle();
    }
  }

  return mixin(MixinInterceptor);
}
