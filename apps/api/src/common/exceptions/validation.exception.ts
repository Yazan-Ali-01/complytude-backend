import { HttpException, HttpStatus } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { CommonI18n } from '../constants';
import type { ValidationDetail } from '../types/validation.types';

export class ValidationException extends HttpException {
  constructor(details: ValidationDetail[]) {
    const i18n = I18nContext.current();
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: i18n?.t(CommonI18n.errors.BAD_REQUEST) ?? 'Bad Request',
        message:
          i18n?.t(CommonI18n.errors.VALIDATION_ERROR) ??
          'Variable validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
