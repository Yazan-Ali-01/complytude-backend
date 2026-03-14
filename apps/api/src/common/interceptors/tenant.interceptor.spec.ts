/* eslint-disable @typescript-eslint/unbound-method */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLS_TENANT_ID } from '@lib/context';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { of } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';

function createMockExecutionContext(
  request: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let reflector: jest.Mocked<Reflector>;
  let pinoLogger: jest.Mocked<PinoLogger>;
  let cls: jest.Mocked<ClsService>;
  let next: CallHandler;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    pinoLogger = {
      assign: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>;

    cls = {
      set: jest.fn(),
    } as unknown as jest.Mocked<ClsService>;

    next = { handle: () => of('response') };

    interceptor = new TenantInterceptor(reflector, pinoLogger, cls);
  });

  it('skips tenant context when route has no auth options', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const request = { auth: {} };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      next: (val) => expect(val).toBe('response'),
      complete: () => {
        expect(cls.set).not.toHaveBeenCalled();
        expect(pinoLogger.assign).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('skips tenant context when tenant auth is false', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ tenant: false });
    const request = { auth: {} };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(cls.set).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('sets tenant_id in CLS when tenant is authenticated', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ tenant: true });
    const request = {
      auth: {
        tenant: {
          tenantId: 'tenant-abc-123',
          userId: 'user-1',
          role: 'admin',
        },
      },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(cls.set).toHaveBeenCalledWith(CLS_TENANT_ID, 'tenant-abc-123');
        done();
      },
    });
  });

  it('assigns tenant_id to pino logger', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ tenant: true });
    const request = {
      auth: {
        tenant: {
          tenantId: 'tenant-xyz-789',
          userId: 'user-2',
          role: 'member',
        },
      },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(pinoLogger.assign).toHaveBeenCalledWith({
          tenant_id: 'tenant-xyz-789',
        });
        done();
      },
    });
  });

  it('sets tenantContext on the request object', (done) => {
    reflector.getAllAndOverride.mockReturnValue({ tenant: true });
    const request: Record<string, unknown> = {
      auth: {
        tenant: {
          tenantId: 'tenant-111',
          userId: 'user-222',
          role: 'viewer',
        },
      },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(request.tenantContext).toEqual({
          tenantId: 'tenant-111',
          userId: 'user-222',
          role: 'viewer',
        });
        done();
      },
    });
  });
});
