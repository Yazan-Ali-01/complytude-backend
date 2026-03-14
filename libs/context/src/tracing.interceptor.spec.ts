/* eslint-disable @typescript-eslint/unbound-method */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { of } from 'rxjs';
import { CLS_TRACE_ID } from './context.constants';
import { TracingInterceptor } from './tracing.interceptor';

describe('TracingInterceptor', () => {
  let interceptor: TracingInterceptor;
  let cls: jest.Mocked<ClsService>;
  let pinoLogger: jest.Mocked<PinoLogger>;
  let context: ExecutionContext;
  let next: CallHandler;

  beforeEach(() => {
    cls = { get: jest.fn() } as unknown as jest.Mocked<ClsService>;
    pinoLogger = { assign: jest.fn() } as unknown as jest.Mocked<PinoLogger>;
    context = {} as ExecutionContext;
    next = { handle: () => of('response') };

    interceptor = new TracingInterceptor(cls, pinoLogger);
  });

  it('assigns trace_id to pino logger when CLS has a trace ID', (done) => {
    cls.get.mockReturnValue('trace-abc-123');

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(cls.get).toHaveBeenCalledWith(CLS_TRACE_ID);
        expect(pinoLogger.assign).toHaveBeenCalledWith({
          trace_id: 'trace-abc-123',
        });
        done();
      },
    });
  });

  it('skips pino assign when no trace ID in CLS', (done) => {
    cls.get.mockReturnValue(undefined);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(pinoLogger.assign).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('calls next.handle()', (done) => {
    cls.get.mockReturnValue('some-id');

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toBe('response');
      },
      complete: done,
    });
  });
});
