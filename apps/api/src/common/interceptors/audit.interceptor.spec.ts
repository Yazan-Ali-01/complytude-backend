/* eslint-disable @typescript-eslint/unbound-method */
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
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

  const identityUser = {
    userId: 'user-456',
    email: 'test@example.com',
    platformRole: null,
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

  it('records a caller who is not signed in as anonymous', (done) => {
    mockAuditConfig({ action: 'AUTH_VERIFICATION_RESENT', options: {} });
    const request = {
      ...baseRequest,
      auth: { tenant: undefined, identity: undefined },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            actorType: 'anonymous',
            action: 'AUTH_VERIFICATION_RESENT',
            details: expect.objectContaining({ outcome: 'success' }),
          }),
        );
        expect(auditService.log.mock.calls[0][0].actorId).toBeUndefined();
        done();
      },
    });
  });

  it('logs with tenant actor on tenant-scoped routes', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
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

  it('logs with identity actor on identity-only routes (login, signup)', (done) => {
    mockAuditConfig({ action: 'AUTH_LOGIN', options: {} });
    const request = {
      ...baseRequest,
      auth: { tenant: undefined, identity: identityUser },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledTimes(1);
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'AUTH_LOGIN',
            actorId: 'user-456',
            actorType: 'user',
          }),
        );
        const logCall = auditService.log.mock.calls[0][0];
        expect(logCall.tenantId).toBeUndefined();
        expect(logCall.userRole).toBeUndefined();
        done();
      },
    });
  });

  it('prefers tenant over identity when both are present', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
    const request = {
      ...baseRequest,
      auth: { tenant: tenantUser, identity: identityUser },
    };
    const context = createMockExecutionContext(request);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123',
            actorId: 'user-456',
            userRole: 'tenant_admin',
          }),
        );
        done();
      },
    });
  });

  it('records a failed attempt with its status, and still fails the request', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);
    const errorNext: CallHandler = {
      handle: () => throwError(() => new ForbiddenException('Forbidden')),
    };

    interceptor.intercept(context, errorNext).subscribe({
      error: (error: unknown) => {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CONTRACT_EXPORTED',
            details: expect.objectContaining({
              outcome: 'failure',
              status: 403,
            }),
          }),
        );
        done();
      },
    });
  });

  it('records an unexpected error as a failure with status 500', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
    const context = createMockExecutionContext(baseRequest);
    const errorNext: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    interceptor.intercept(context, errorNext).subscribe({
      error: () => {
        expect(auditService.log.mock.calls[0][0].details).toEqual(
          expect.objectContaining({ outcome: 'failure', status: 500 }),
        );
        done();
      },
    });
  });

  it('extracts resource ID from route params when resourceIdParam set', (done) => {
    mockAuditConfig({
      action: 'CONTRACT_EXPORTED',
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
    mockAuditConfig({ action: 'CONTRACT_CREATED', options: {} });
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
    mockAuditConfig({ action: 'CONTRACT_CREATED', options: {} });
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
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
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
      action: 'REPORT_GENERATED',
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
      action: 'CONTRACT_CREATED',
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
      action: 'CONTRACT_EXPORTED',
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

  it('records request.ip, never an X-Forwarded-For entry the client wrote', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
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
          expect.objectContaining({ ipAddress: '127.0.0.1' }),
        );
        done();
      },
    });
  });

  it('includes method and url in details', (done) => {
    mockAuditConfig({ action: 'CONTRACT_EXPORTED', options: {} });
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
