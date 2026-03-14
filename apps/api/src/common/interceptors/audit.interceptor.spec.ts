/* eslint-disable @typescript-eslint/unbound-method */
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuditService } from '@lib/audit';
import { of, throwError } from 'rxjs';
import { AUDIT_KEY, AuditConfig } from '../decorators/audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

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

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditService: jest.Mocked<AuditService>;
  let reflector: jest.Mocked<Reflector>;
  let next: CallHandler;

  const tenantUser = {
    tenantId: 'tenant-123',
    userId: 'user-456',
    email: 'test@example.com',
    role: 'tenant_admin',
  };

  const baseRequest = {
    method: 'POST',
    url: '/contracts/abc/export',
    headers: { 'user-agent': 'TestAgent/1.0' },
    ip: '127.0.0.1',
    params: { id: 'abc' },
    body: { name: 'test' },
    auth: { tenant: tenantUser, identity: undefined },
  };

  beforeEach(() => {
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;

    reflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    next = { handle: () => of({ id: 'response-id-1' }) };

    interceptor = new AuditInterceptor(auditService, reflector);
  });

  function mockAuditConfig(config: AuditConfig | undefined): void {
    reflector.get.mockImplementation((key: string) => {
      if (key === AUDIT_KEY) return config;
      if (key === PATH_METADATA) return 'contracts';
      return undefined;
    });
  }

  it('passes through without logging when no @Audit() metadata', (done) => {
    mockAuditConfig(undefined);
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('passes through without logging when no tenant auth', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const request = {
      ...baseRequest,
      auth: { tenant: undefined, identity: undefined },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('logs audit event on successful response', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledTimes(1);
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CONTRACT_EXPORTED',
            tenantId: 'tenant-123',
            actorId: 'user-456',
            actorType: 'user',
            userRole: 'tenant_admin',
          }),
        );
        done();
      },
    });
  });

  it('does NOT log on error response', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);
    const errorNext: CallHandler = {
      handle: () => throwError(() => new Error('Forbidden')),
    };

    interceptor.intercept(context, errorNext).subscribe({
      error: () => {
        expect(auditService.log).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('extracts resource ID from route params when resourceIdParam set', (done) => {
    mockAuditConfig({
      event: 'CONTRACT_EXPORTED',
      options: { resourceIdParam: 'id' },
    });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ resourceId: 'abc' }),
        );
        done();
      },
    });
  });

  it('falls back to response body ID when no resourceIdParam', (done) => {
    mockAuditConfig({ event: 'CONTRACT_CREATED', options: {} });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ resourceId: 'response-id-1' }),
        );
        done();
      },
    });
  });

  it('extracts resource ID from nested response.data.id', (done) => {
    mockAuditConfig({ event: 'CONTRACT_CREATED', options: {} });
    const nestedNext: CallHandler = {
      handle: () => of({ data: { id: 'nested-id' } }),
    };
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, nestedNext).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ resourceId: 'nested-id' }),
        );
        done();
      },
    });
  });

  it('auto-derives resourceType from controller path', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'contracts' }),
        );
        done();
      },
    });
  });

  it('uses explicit resourceType from options over controller path', (done) => {
    mockAuditConfig({
      event: 'REPORT_GENERATED',
      options: { resourceType: 'reports' },
    });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'reports' }),
        );
        done();
      },
    });
  });

  it('includes sanitized body in details when includeBody is true', (done) => {
    mockAuditConfig({
      event: 'CONTRACT_CREATED',
      options: { includeBody: true },
    });
    const requestWithBody = {
      ...baseRequest,
      body: { name: 'test', password: 'secret123' },
    };
    const context = createMockExecutionContext(requestWithBody);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const logCall = auditService.log.mock.calls[0][0];
        expect(logCall.details).toEqual(
          expect.objectContaining({
            body: { name: 'test', password: '[REDACTED]' },
          }),
        );
        done();
      },
    });
  });

  it('does not include body in details when includeBody is false', (done) => {
    mockAuditConfig({
      event: 'CONTRACT_EXPORTED',
      options: { includeBody: false },
    });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const logCall = auditService.log.mock.calls[0][0];
        expect(logCall.details).not.toHaveProperty('body');
        done();
      },
    });
  });

  it('extracts IP from X-Forwarded-For header', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const request = {
      ...baseRequest,
      headers: {
        ...baseRequest.headers,
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ ipAddress: '10.0.0.1' }),
        );
        done();
      },
    });
  });

  it('falls back to request.ip when no X-Forwarded-For', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ ipAddress: '127.0.0.1' }),
        );
        done();
      },
    });
  });

  it('includes method and url in details', (done) => {
    mockAuditConfig({ event: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const logCall = auditService.log.mock.calls[0][0];
        expect(logCall.details).toEqual(
          expect.objectContaining({
            method: 'POST',
            url: '/contracts/abc/export',
          }),
        );
        done();
      },
    });
  });
});
