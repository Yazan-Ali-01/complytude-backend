import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { ModulesContainer } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { PLATFORM_PERMISSIONS_KEY } from 'src/common/decorators/platform-permissions.decorator';
import { TENANT_PERMISSIONS_KEY } from 'src/common/decorators/tenant-permissions.decorator';
import {
  AUTH_OPTIONS_KEY,
  AUTH_REFRESH_OPTIONS_KEY,
  IS_PUBLIC_KEY,
} from 'src/modules/auth/decorators/auth-options.decorator';
import { ROLES_KEY } from 'src/modules/auth/decorators/roles.decorator';
import { resetTestState } from '../helpers/redis-flush.helper';
import type { TestApp } from '../setup/test-app.factory';

/**
 * Every route the API serves says how it is authenticated: @AuthOptions (with a token),
 * @AuthRefreshOptions (with JwtAuthRefreshGuard) or @Public(). A route with none of them is
 * denied by the global JwtAuthGuard; none may be left that way. The public list below is exact, so
 * adding a public route fails this test until the list is updated and reviewed.
 */
const PUBLIC_ROUTES = [
  'GET /',
  'GET addons',
  'GET addons/:key',
  'GET auth/google',
  'GET auth/google/callback',
  'GET auth/invitations/resolve',
  'GET auth/microsoft',
  'GET auth/microsoft/callback',
  'GET entitlements/plans',
  'GET entitlements/plans/:key',
  'GET health',
  'GET health/ready',
  'POST auth/forgot-password',
  'POST auth/login',
  'POST auth/resend-verification',
  'POST auth/reset-password',
  'POST auth/signup',
  'POST auth/verify-email',
  'POST stripe/webhook',
].sort();

const MOCK_PATH_PREFIXES = ['mock/', 'admin/queue-test/', 'rag-mock/'];

interface TokenOptions {
  tenant?: boolean;
  identity?: boolean;
}

interface PermissionMetadata {
  permissions?: string[];
}

interface RouteInfo {
  id: string;
  path: string;
  handler: string;
  authOptions?: TokenOptions;
  refreshOptions?: TokenOptions;
  isPublic: boolean;
  guards: string[];
  tenantPermissions?: PermissionMetadata;
  platformPermissions?: PermissionMetadata;
  roles?: string[];
}

interface BootedApp {
  testApp: TestApp;
  modulesContainer: ModulesContainer;
}

// Migrations run once per Jest worker, guarded by a flag in this module. Every isolated registry
// below gets this one copy, so a second boot in the same file doesn't re-run them.
const workerDatabaseSetup = jest.requireActual<{
  ensureWorkerDatabase: () => Promise<void>;
}>('../setup/worker-database.setup');
jest.doMock('../setup/worker-database.setup', () => workerDatabaseSetup);

/**
 * ConfigModule and the ConditionalModule mock gate read the env when app.module.ts is imported,
 * so the env is set first and AppModule is loaded in a fresh module registry.
 */
async function bootApp(env: Record<string, string>): Promise<BootedApp> {
  Object.assign(process.env, env);
  let booted: BootedApp | undefined;
  await jest.isolateModulesAsync(async () => {
    const core =
      jest.requireActual<typeof import('@nestjs/core')>('@nestjs/core');
    const { createTestApp } = jest.requireActual<{
      createTestApp: () => Promise<TestApp>;
    }>('../setup/test-app.factory');
    const testApp = await createTestApp();
    booted = {
      testApp,
      modulesContainer: testApp.module.get(core.ModulesContainer),
    };
  });
  if (!booted) throw new Error('App did not boot');
  return booted;
}

function toPaths(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => String(v ?? '').replace(/^\/+|\/+$/g, ''));
}

function guardNames(target: object): string[] {
  const guards =
    (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ??
    [];
  return guards.map((guard) =>
    typeof guard === 'function'
      ? guard.name
      : (guard as object).constructor.name,
  );
}

function collectRoutes(modulesContainer: ModulesContainer): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const moduleRef of modulesContainer.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const controller = wrapper.metatype as
        | (abstract new (...args: never[]) => unknown)
        | null;
      if (!controller) continue;
      const prefixes = toPaths(Reflect.getMetadata(PATH_METADATA, controller));

      const methodNames = new Set<string>();
      for (
        let proto: object | null = controller.prototype as object;
        proto && proto !== Object.prototype;
        proto = Object.getPrototypeOf(proto) as object | null
      ) {
        Object.getOwnPropertyNames(proto).forEach((n) => methodNames.add(n));
      }

      for (const name of methodNames) {
        const handler: unknown = (
          controller.prototype as Record<string, unknown>
        )[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        const handlerPath: unknown = Reflect.getMetadata(
          PATH_METADATA,
          handler,
        );
        if (method === undefined || handlerPath === undefined) continue;

        const meta = <T>(key: string): T | undefined =>
          (Reflect.getMetadata(key, handler) ??
            Reflect.getMetadata(key, controller)) as T | undefined;

        for (const prefix of prefixes) {
          for (const suffix of toPaths(handlerPath)) {
            const path = [prefix, suffix].filter(Boolean).join('/');
            routes.push({
              id: `${RequestMethod[method]} ${path || '/'}`,
              path,
              handler: `${controller.name}.${name}`,
              authOptions: meta<TokenOptions>(AUTH_OPTIONS_KEY),
              refreshOptions: meta<TokenOptions>(AUTH_REFRESH_OPTIONS_KEY),
              isPublic: meta<boolean>(IS_PUBLIC_KEY) === true,
              guards: [...guardNames(controller), ...guardNames(handler)],
              tenantPermissions: meta<PermissionMetadata>(
                TENANT_PERMISSIONS_KEY,
              ),
              platformPermissions: meta<PermissionMetadata>(
                PLATFORM_PERMISSIONS_KEY,
              ),
              roles: meta<string[]>(ROLES_KEY),
            });
          }
        }
      }
    }
  }
  return routes;
}

function authModeCount(route: RouteInfo): number {
  const needsToken = Boolean(
    route.authOptions?.tenant || route.authOptions?.identity,
  );
  const refresh = route.refreshOptions !== undefined;
  return [needsToken, refresh, route.isPublic].filter(Boolean).length;
}

/** Routes whose authentication is ambiguous or not actually enforced. */
function authModeViolations(routes: RouteInfo[]): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    if (authModeCount(route) > 1) {
      violations.push(
        `${route.id} (${route.handler}): more than one of @AuthOptions, @AuthRefreshOptions, @Public()`,
      );
    }
    if (
      route.refreshOptions !== undefined &&
      !route.guards.includes('JwtAuthRefreshGuard')
    ) {
      violations.push(
        `${route.id} (${route.handler}): @AuthRefreshOptions without JwtAuthRefreshGuard`,
      );
    }
  }
  return violations;
}

/** Permission/role guards applied without the metadata they check (they would deny every call). */
function guardMetadataViolations(routes: RouteInfo[]): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    const missing = (guard: string, present: boolean): void => {
      if (route.guards.includes(guard) && !present) {
        violations.push(
          `${route.id} (${route.handler}): ${guard} without metadata`,
        );
      }
    };
    missing(
      'TenantPermissionsGuard',
      Boolean(route.tenantPermissions?.permissions?.length),
    );
    missing(
      'PlatformPermissionsGuard',
      Boolean(route.platformPermissions?.permissions?.length),
    );
    missing('RolesGuard', Boolean(route.roles?.length));
  }
  return violations;
}

const isMockRoute = (route: RouteInfo): boolean =>
  MOCK_PATH_PREFIXES.some((prefix) => `${route.path}/`.startsWith(prefix));

describe('Route authentication inventory', () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('with NODE_ENV=production', () => {
    let booted: BootedApp;
    let server: FastifyInstance;
    let routes: RouteInfo[];

    beforeAll(async () => {
      booted = await bootApp({
        NODE_ENV: 'production',
        ENABLE_MOCK_ROUTES: 'false',
        // Required in production (env.schema.ts); .env.test's test values are refused there
        BULL_BOARD_ADMIN_SECRET: 'route-auth-inventory-secret-0123456789',
        FRONTEND_URL: 'https://app.example.com',
        AUTH_ECHO_TOKENS: 'false',
        RATE_LIMIT_ENABLED: 'true',
        TRUST_PROXY_HOPS: '1',
        STRIPE_SECRET_KEY: 'sk_test_route_inventory_0123456789',
        STRIPE_WEBHOOK_SECRET: 'whsec_route_inventory_0123456789',
      });
      server = booted.testApp.app
        .getHttpAdapter()
        .getInstance() as FastifyInstance;
      routes = collectRoutes(booted.modulesContainer);
    }, 60000);

    beforeEach(async () => {
      await resetTestState(
        booted.testApp.databaseService,
        booted.testApp.redisClient,
      );
    }, 15000);

    afterAll(async () => {
      if (booted) await booted.testApp.cleanup();
    }, 30000);

    it('discovers the full route table', () => {
      expect(routes.length).toBeGreaterThan(100);
    });

    it('mounts no mock, queue-test or rag-mock routes', () => {
      expect(routes.filter(isMockRoute).map((r) => r.id)).toEqual([]);
    });

    it('gives no route an ambiguous or unenforced authentication mode', () => {
      expect(authModeViolations(routes)).toEqual([]);
    });

    it('leaves no route without an authentication mode', () => {
      const undecorated = routes
        .filter((r) => authModeCount(r) === 0)
        .map((r) => r.id)
        .sort();
      expect(undecorated).toEqual([]);
    });

    it('exposes exactly the reviewed public routes', () => {
      const publicRoutes = routes
        .filter((r) => r.isPublic)
        .map((r) => r.id)
        .sort();
      expect(publicRoutes).toEqual(PUBLIC_ROUTES);
    });

    it('never applies a permission or role guard without its metadata', () => {
      expect(guardMetadataViolations(routes)).toEqual([]);
    });

    it.each([
      ['POST', '/api/v1/admin/queue-test/enqueue/billing/reconciliation'],
      ['GET', '/api/v1/admin/queue-test/jobs/billing'],
      ['POST', '/api/v1/mock/credits/grant'],
      ['POST', '/api/v1/mock/snapshots/plan-change-flow'],
      ['GET', '/api/v1/rag-mock/contracts'],
    ] as const)('%s %s returns 404', async (method, url) => {
      const res = await server.inject({ method, url });
      expect(res.statusCode).toBe(404);
    });

    it.each([
      ['GET', '/api/v1/users/me'],
      ['PATCH', '/api/v1/users/me/password'],
    ] as const)(
      '%s %s without a token is denied with 401',
      async (method, url) => {
        const res = await server.inject({ method, url, payload: {} });
        expect(res.statusCode).toBe(401);
      },
    );

    it('still serves public routes without a token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/entitlements/plans',
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('with ENABLE_MOCK_ROUTES=true outside production', () => {
    let booted: BootedApp;
    let server: FastifyInstance;
    let routes: RouteInfo[];

    beforeAll(async () => {
      booted = await bootApp({ NODE_ENV: 'test', ENABLE_MOCK_ROUTES: 'true' });
      server = booted.testApp.app
        .getHttpAdapter()
        .getInstance() as FastifyInstance;
      routes = collectRoutes(booted.modulesContainer);
    }, 60000);

    beforeEach(async () => {
      await resetTestState(
        booted.testApp.databaseService,
        booted.testApp.redisClient,
      );
    }, 15000);

    afterAll(async () => {
      if (booted) await booted.testApp.cleanup();
    }, 30000);

    it('mounts the mock routes', () => {
      const mounted = MOCK_PATH_PREFIXES.filter((prefix) =>
        routes.some((r) => `${r.path}/`.startsWith(prefix)),
      );
      expect(mounted).toEqual(MOCK_PATH_PREFIXES);
    });

    it('holds the mock routes to the same rules', () => {
      expect(authModeViolations(routes)).toEqual([]);
      expect(guardMetadataViolations(routes)).toEqual([]);
      const mockRoutes = routes.filter(isMockRoute);
      expect(mockRoutes.filter((r) => authModeCount(r) !== 1)).toEqual([]);
      expect(mockRoutes.filter((r) => r.isPublic)).toEqual([]);
    });

    it('no longer serves queue-test without a token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/queue-test/jobs/billing',
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
