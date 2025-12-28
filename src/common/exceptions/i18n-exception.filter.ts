import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { BusinessException } from './business.exception';
import { ValidationException } from './validation.exception';
import { I18nTranslations } from '../../i18n/i18n.types';
import { ValidationDetail } from '../../types/validation.types';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  details?: ValidationDetail[];
}

const DEFAULT_MESSAGES = {
  INTERNAL_ERROR: 'Internal server error',
  VALIDATION_FAILED: 'Validation failed',
  ERROR_OCCURRED: 'An error occurred',
} as const;

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const i18n = this.getI18nContext();
    const status = this.getStatusCode(exception);
    const exceptionResponse = this.getExceptionResponse(exception);

    const responseBody = await this.buildResponseBody(
      exception,
      i18n,
      status,
      exceptionResponse,
    );

    this.logErrorIfNeeded(exception, status);
    reply.status(status).send(responseBody);
  }

  private getI18nContext(): I18nContext<I18nTranslations> | undefined {
    return I18nContext.current() as I18nContext<I18nTranslations> | undefined;
  }

  private getStatusCode(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getExceptionResponse(exception: unknown): any {
    return exception instanceof HttpException
      ? exception.getResponse()
      : { message: DEFAULT_MESSAGES.INTERNAL_ERROR };
  }

  private async buildResponseBody(
    exception: unknown,
    i18n: I18nContext<I18nTranslations> | undefined,
    status: number,
    exceptionResponse: any,
  ): Promise<ErrorResponse> {
    if (exception instanceof BusinessException) {
      return this.handleBusinessException(exception, i18n, status);
    }
    if (exception instanceof ValidationException) {
      return this.handleValidationException(
        exception,
        i18n,
        status,
        exceptionResponse,
      );
    }
    if (exception instanceof HttpException) {
      return this.handleHttpException(
        exception,
        i18n,
        status,
        exceptionResponse,
      );
    }
    return this.handleUnknownException(exception, i18n, status);
  }

  private async translate(
    i18n: I18nContext<I18nTranslations> | undefined,
    key: string,
    args?: Record<string, any>,
  ): Promise<string> {
    if (!i18n) {
      return key;
    }

    try {
      const translated = await i18n.t(key as any, { args: args || {} });
      return typeof translated === 'string' ? translated : String(translated);
    } catch (error) {
      this.logger.warn(
        `Translation failed for key "${key}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return key;
    }
  }
  private async handleBusinessException(
    exception: BusinessException,
    i18n: I18nContext<I18nTranslations> | undefined,
    status: number,
  ): Promise<ErrorResponse> {
    const message = await this.translate(
      i18n,
      exception.translationKey,
      exception.translationArgs,
    );

    return {
      statusCode: status,
      message:
        message !== exception.translationKey
          ? message
          : exception.fallbackMessage || DEFAULT_MESSAGES.ERROR_OCCURRED,
      error: HttpStatus[status] || 'Error',
    };
  }

  private async handleValidationException(
    exception: ValidationException,
    i18n: I18nContext<I18nTranslations> | undefined,
    status: number,
    exceptionResponse: any,
  ): Promise<ErrorResponse> {
    const message = await this.translate(i18n, exception.translationKey);

    const details = exceptionResponse?.details || [];
    const translatedDetails = await this.translateValidationDetails(
      details,
      i18n,
    );

    return {
      statusCode: status,
      message:
        message !== exception.translationKey
          ? message
          : (typeof exceptionResponse === 'object' &&
              exceptionResponse?.message) ||
            DEFAULT_MESSAGES.VALIDATION_FAILED,
      error: 'Bad Request',
      details: translatedDetails.length > 0 ? translatedDetails : details,
    };
  }

  private async translateValidationDetails(
    details: ValidationDetail[],
    i18n: I18nContext<I18nTranslations> | undefined,
  ): Promise<ValidationDetail[]> {
    if (!Array.isArray(details) || details.length === 0 || !i18n) {
      return details;
    }

    const translatedDetails: ValidationDetail[] = [];

    for (const detail of details) {
      if (detail.translationKey) {
        const translatedMessage = await this.translate(
          i18n,
          detail.translationKey,
          {
            fieldLabel: detail.field,
            expected: detail.expected,
            received: detail.received,
            ...detail.translationArgs,
          },
        );
        translatedDetails.push({
          ...detail,
          message: translatedMessage,
        });
      } else {
        translatedDetails.push(detail);
      }
    }

    return translatedDetails;
  }

  private async handleHttpException(
    exception: HttpException,
    i18n: I18nContext<I18nTranslations> | undefined,
    status: number,
    exceptionResponse: any,
  ): Promise<ErrorResponse> {
    let message: string =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse?.message || DEFAULT_MESSAGES.ERROR_OCCURRED;

    if (i18n && this.looksLikeTranslationKey(message)) {
      const translated = await this.translate(i18n, message);
      if (translated !== message) {
        message = translated;
      }
    }

    return {
      statusCode: status,
      message,
      error:
        (typeof exceptionResponse === 'object' && exceptionResponse?.error) ||
        HttpStatus[status] ||
        'Error',
      ...(typeof exceptionResponse === 'object' &&
        exceptionResponse.details && { details: exceptionResponse.details }),
    };
  }

  private looksLikeTranslationKey(message: string): boolean {
    return message.includes('.') && !message.includes(' ');
  }

  private async handleUnknownException(
    exception: unknown,
    i18n: I18nContext<I18nTranslations> | undefined,
    status: number,
  ): Promise<ErrorResponse> {
    const message = await this.translate(
      i18n,
      'common.errors.generic.internalServerError',
    );

    return {
      statusCode: status,
      message:
        message !== 'common.errors.generic.internalServerError'
          ? message
          : DEFAULT_MESSAGES.INTERNAL_ERROR,
      error: 'Internal Server Error',
    };
  }

  private logErrorIfNeeded(exception: unknown, status: number): void {
    if (
      !(exception instanceof BusinessException) &&
      !(exception instanceof ValidationException) &&
      status >= 500
    ) {
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
  }
}
