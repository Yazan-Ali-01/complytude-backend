import { HttpException, HttpStatus } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

export class ValidationException extends HttpException {
  constructor(details: any[]) {
    const i18n = I18nContext.current();
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: i18n?.t('common.BAD_REQUEST') ?? 'Bad Request',
        message:
          i18n?.t('common.VALIDATION_ERROR') ?? 'Variable validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
