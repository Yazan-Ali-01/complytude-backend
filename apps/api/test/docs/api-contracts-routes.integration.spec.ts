import type { FastifyInstance, HTTPMethods } from 'fastify';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const METHODS: HTTPMethods[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** First path segments of the API's routes: a backticked path starting with one is a route. */
const API_SEGMENTS =
  'auth|users|tenants|documents|analysis-jobs|generation-jobs|billing|rulesets|templates|entitlements|addons|authorities|categories|audit-logs|admin|stripe';

/** Mentioned in the doc but not served by the API (Bull Board runs on its own port). */
const NOT_API_ROUTES = new Set(['/api/v1/admin/queues']);

/**
 * Every route `apps/api/docs/API_CONTRACTS.md` names ("POST /auth/login", "/api/v1/documents/:id",
 * `/auth/refresh-tenant`) is one the API serves, so a frontend built from the doc calls real
 * endpoints. Paths without a prefix are under `/api/v1`; `{param}` and `:param` both match any
 * parameter name. TypeScript examples and "Base path:" lines are illustrations, not routes.
 */
describe('API_CONTRACTS.md names only routes that exist', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function mentionedRoutes(
    source: string,
  ): Array<[HTTPMethods | null, string]> {
    const doc = source
      .replace(/```(?:typescript|ts)\n[\s\S]*?```/g, '')
      .replace(/^Base path:.*$/gm, '');
    const found = new Map<string, [HTTPMethods | null, string]>();
    const normalize = (raw: string): string => {
      const path = raw
        .replace(/[?#].*$/, '')
        .replace(/[.,;:)`'"*]+$/, '')
        .replace(/\{(\w+)\}/g, ':$1');
      return path.startsWith('/api/') ? path : `/api/v1${path}`;
    };
    const path = String.raw`(/[A-Za-z0-9_\-/:{}.]*[A-Za-z0-9_}])`;
    for (const [, method, raw] of doc.matchAll(
      new RegExp(String.raw`\b(GET|POST|PUT|PATCH|DELETE)\s+` + path, 'g'),
    )) {
      const url = normalize(raw);
      found.set(`${method} ${url}`, [method as HTTPMethods, url]);
    }
    for (const [, raw] of doc.matchAll(
      new RegExp(String.raw`(?<![\w/])(/api/v1` + path.slice(2), 'g'),
    )) {
      const url = normalize(raw);
      if (![...found.values()].some(([, known]) => known === url)) {
        found.set(`* ${url}`, [null, url]);
      }
    }
    for (const [, raw] of doc.matchAll(
      new RegExp('`(/(?:' + API_SEGMENTS + ')(?:/[^`\\s]*)?)`', 'g'),
    )) {
      const url = normalize(raw);
      if (![...found.values()].some(([, known]) => known === url)) {
        found.set(`* ${url}`, [null, url]);
      }
    }
    return [...found.values()].filter(
      ([, url]) => !NOT_API_ROUTES.has(url) && !/^\/api\/v1\/:/.test(url),
    );
  }

  it('finds each documented route in the running API', () => {
    const doc = readFileSync(
      join(__dirname, '../../docs/API_CONTRACTS.md'),
      'utf8',
    );
    const routes = mentionedRoutes(doc);
    expect(routes.length).toBeGreaterThan(40);

    const missing = routes
      .filter(([method, url]) =>
        method
          ? !server.hasRoute({ method, url })
          : !METHODS.some((m) => server.hasRoute({ method: m, url })),
      )
      .map(([method, url]) => `${method ?? '*'} ${url}`);

    expect(missing).toEqual([]);
  });
});
