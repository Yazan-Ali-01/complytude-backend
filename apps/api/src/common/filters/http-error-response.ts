import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { CommonI18n } from '../constants/i18n.constants';

/** The error body every endpoint returns (ErrorResponseDto). */
export interface HttpErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  traceId: string;
  timestamp: string;
  path: string;
  [extra: string]: unknown;
}

export type Translate = (key: string) => string;

interface Mapped {
  status: number;
  /** A translation key, or the message an HttpException already carries. */
  messageKey?: string;
  message?: string | string[];
  extra?: Record<string, unknown>;
}

/** Postgres error codes the client can act on (the rest are server faults). */
const PG_STATUS: Record<string, { status: number; messageKey: string }> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    messageKey: CommonI18n.errors.CONFLICT,
  },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.INVALID_REFERENCE,
  },
  '23502': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.BAD_REQUEST,
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.BAD_REQUEST,
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.BAD_REQUEST,
  },
  '22001': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.BAD_REQUEST,
  },
  '22003': {
    status: HttpStatus.BAD_REQUEST,
    messageKey: CommonI18n.errors.BAD_REQUEST,
  },
  '40001': {
    status: HttpStatus.CONFLICT,
    messageKey: CommonI18n.errors.CONCURRENT_UPDATE,
  },
  '40P01': {
    status: HttpStatus.CONFLICT,
    messageKey: CommonI18n.errors.CONCURRENT_UPDATE,
  },
  '57014': {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    messageKey: CommonI18n.errors.SERVICE_BUSY,
  },
  '53300': {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    messageKey: CommonI18n.errors.SERVICE_BUSY,
  },
};

const STATUS_MESSAGE_KEYS: Record<number, string> = {
  400: CommonI18n.errors.BAD_REQUEST,
  401: CommonI18n.errors.UNAUTHORIZED,
  403: CommonI18n.errors.FORBIDDEN,
  404: CommonI18n.errors.NOT_FOUND,
  413: CommonI18n.errors.PAYLOAD_TOO_LARGE,
  415: CommonI18n.errors.UNSUPPORTED_MEDIA_TYPE,
  429: CommonI18n.errors.TOO_MANY_REQUESTS,
};

function isPgError(
  error: unknown,
): error is { code: string; severity: string } {
  const e = error as { code?: unknown; severity?: unknown } | null;
  return (
    !!e &&
    typeof e.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(e.code) &&
    typeof e.severity === 'string'
  );
}

function stripeErrorType(error: unknown): string | null {
  const type = (error as { type?: unknown } | null)?.type;
  return typeof type === 'string' && type.startsWith('Stripe') ? type : null;
}

function map(error: unknown): Mapped {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();
    if (typeof response === 'string') return { status, message: response };
    const {
      statusCode: _statusCode,
      error: _error,
      message,
      ...extra
    } = response as Record<string, unknown>;
    return {
      status,
      message:
        typeof message === 'string' || Array.isArray(message)
          ? (message as string | string[])
          : error.message,
      extra,
    };
  }
  if (isPgError(error)) {
    return PG_STATUS[error.code] ?? { status: 500 };
  }
  const stripeType = stripeErrorType(error);
  if (stripeType) {
    return stripeType === 'StripeCardError'
      ? {
          status: HttpStatus.PAYMENT_REQUIRED,
          messageKey: CommonI18n.errors.PAYMENT_DECLINED,
        }
      : {
          status: HttpStatus.BAD_GATEWAY,
          messageKey: CommonI18n.errors.PAYMENT_PROVIDER_ERROR,
        };
  }
  // Framework errors (body parsing, multipart limits) carry a 4xx status; their text is not ours
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status };
  }
  return { status: 500 };
}

/**
 * Turns any error into the documented envelope. Only an HttpException's own message reaches the
 * client; for anything else the message is generic (never SQL, a stack or a provider's text).
 */
export function toHttpErrorBody(
  error: unknown,
  request: { id: string; url: string },
  t: Translate,
): HttpErrorBody {
  const mapped = map(error);
  const messageKey =
    mapped.messageKey ??
    STATUS_MESSAGE_KEYS[mapped.status] ??
    (mapped.status >= 500
      ? CommonI18n.errors.INTERNAL_SERVER_ERROR
      : CommonI18n.errors.BAD_REQUEST);
  return {
    ...mapped.extra,
    statusCode: mapped.status,
    error: STATUS_CODES[mapped.status] ?? 'Error',
    message: mapped.message ?? t(messageKey),
    traceId: request.id,
    timestamp: new Date().toISOString(),
    path: request.url,
  };
}
