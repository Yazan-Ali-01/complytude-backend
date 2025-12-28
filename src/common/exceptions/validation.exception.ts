import { HttpException, HttpStatus } from '@nestjs/common';
import { ValidationDetail } from '../../types/validation.types';

const DEFAULT_VALIDATION_TRANSLATION_KEY =
  'common.errors.validation.failed' as const;
export class ValidationException extends HttpException {
  readonly translationKey: string;

  constructor(details: ValidationDetail[], translationKey?: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Variable validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );

    this.translationKey = translationKey || DEFAULT_VALIDATION_TRANSLATION_KEY;
  }
}