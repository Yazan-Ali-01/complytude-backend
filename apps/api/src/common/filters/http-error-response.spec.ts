import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ValidationException } from '../exceptions/validation.exception';
import { toHttpErrorBody } from './http-error-response';

describe('toHttpErrorBody', () => {
  const request = { id: 'trace-123', url: '/api/v1/things' };
  const t = (key: string): string => `t:${key}`;
  const body = (error: unknown) => toHttpErrorBody(error, request, t);

  it('keeps an HttpException as it is, with the trace id, path and time', () => {
    expect(body(new NotFoundException('Document not found'))).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Document not found',
      traceId: 'trace-123',
      path: '/api/v1/things',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('keeps the extra fields an HttpException carries (validation details, retry-after)', () => {
    expect(
      body(
        new ValidationException([
          { field: 'email', message: 'invalid' } as never,
        ]),
      ),
    ).toMatchObject({ statusCode: 400, details: [{ field: 'email' }] });
    expect(
      body(
        new HttpException(
          { statusCode: 429, message: 'Locked', retryAfterSeconds: 60 },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      ),
    ).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Locked',
      retryAfterSeconds: 60,
    });
    expect(body(new ConflictException()).message).toBe('Conflict');
  });

  it.each([
    ['23505', 409, 'common.errors.CONFLICT'],
    ['23503', 400, 'common.errors.INVALID_REFERENCE'],
    ['22P02', 400, 'common.errors.BAD_REQUEST'],
    ['40001', 409, 'common.errors.CONCURRENT_UPDATE'],
    ['57014', 503, 'common.errors.SERVICE_BUSY'],
    ['42P01', 500, 'common.errors.INTERNAL_SERVER_ERROR'],
  ])('maps Postgres %s to %i without the SQL', (code, status, messageKey) => {
    const error = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "users_email_key"',
      ),
      { code, severity: 'ERROR', detail: 'Key (email)=(a@b.com) exists.' },
    );

    const result = body(error);

    expect(result).toMatchObject({
      statusCode: status,
      message: `t:${messageKey}`,
    });
    expect(JSON.stringify(result)).not.toMatch(/users_email_key|a@b\.com/);
  });

  it('maps Stripe errors: a declined card is 402, anything else from Stripe 502', () => {
    const stripe = (type: string) =>
      Object.assign(new Error('Your card was declined (req_123)'), { type });

    expect(body(stripe('StripeCardError'))).toMatchObject({
      statusCode: 402,
      message: 't:common.errors.PAYMENT_DECLINED',
    });
    expect(body(stripe('StripeAPIError'))).toMatchObject({
      statusCode: 502,
      message: 't:common.errors.PAYMENT_PROVIDER_ERROR',
    });
  });

  it('keeps a framework 4xx status with a generic message', () => {
    const tooLarge = Object.assign(new Error('Request body is too large'), {
      statusCode: 413,
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
    });

    expect(body(tooLarge)).toMatchObject({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 't:common.errors.PAYLOAD_TOO_LARGE',
    });
  });

  it('never returns the message or stack of an unexpected error', () => {
    const result = body(
      new TypeError("Cannot read properties of undefined (reading 'secret')"),
    );

    expect(result).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 't:common.errors.INTERNAL_SERVER_ERROR',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
