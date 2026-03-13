/* eslint-disable @typescript-eslint/unbound-method */
import { ClsService } from 'nestjs-cls';
import { CLS_TRACE_ID } from './context.constants';
import { TracingMiddleware } from './tracing.middleware';

describe('TracingMiddleware', () => {
  let middleware: TracingMiddleware;
  let cls: jest.Mocked<ClsService>;

  beforeEach(() => {
    cls = { set: jest.fn() } as unknown as jest.Mocked<ClsService>;
    middleware = new TracingMiddleware(cls);
  });

  it('stores req.id as CLS_TRACE_ID', () => {
    const req = { id: 'abc-123' } as unknown as Parameters<
      TracingMiddleware['use']
    >[0];
    const res = {} as unknown as Parameters<TracingMiddleware['use']>[1];
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(cls.set).toHaveBeenCalledWith(CLS_TRACE_ID, 'abc-123');
  });

  it('calls next()', () => {
    const req = { id: 'ghi-789' } as unknown as Parameters<
      TracingMiddleware['use']
    >[0];
    const res = {} as unknown as Parameters<TracingMiddleware['use']>[1];
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
