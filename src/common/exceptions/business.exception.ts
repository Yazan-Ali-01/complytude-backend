import { HttpException, HttpStatus } from '@nestjs/common';
export class BusinessException extends HttpException {
  readonly translationKey: string;
  readonly translationArgs?: Record<string, string | number | boolean>;
  readonly fallbackMessage?: string;

  constructor(
    translationKey: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    translationArgs?: Record<string, string | number | boolean>,
    fallbackMessage?: string,
  ) {
    super(
      {
        statusCode,
        message: fallbackMessage || translationKey,
        error: HttpStatus[statusCode] || 'Error',
      },
      statusCode,
    );

    this.translationKey = translationKey;
    this.translationArgs = translationArgs;
    this.fallbackMessage = fallbackMessage;
  }
}
