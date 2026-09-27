import { FastifyInstance } from 'fastify';
import {
  BULL_BOARD_BASE_PATH,
  buildBullBoardServer,
  bullBoardHost,
  isBullBoardSecretValid,
} from './bull-board.server';

const SECRET = 'bull-board-test-secret-0123456789abcdef';

const basic = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const DASHBOARD_PATHS = [
  BULL_BOARD_BASE_PATH,
  `${BULL_BOARD_BASE_PATH}/api/queues`,
];

describe('isBullBoardSecretValid', () => {
  it('accepts the exact secret', () => {
    expect(isBullBoardSecretValid(SECRET, SECRET)).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['wrong', 'wrong'],
    ['one character short', SECRET.slice(0, -1)],
    ['one character longer', `${SECRET}x`],
    ['different case', SECRET.toUpperCase()],
  ])('rejects a %s value without throwing', (_label, presented) => {
    expect(isBullBoardSecretValid(presented, SECRET)).toBe(false);
  });
});

describe('bullBoardHost', () => {
  it('binds an open dashboard (no secret) to loopback only', () => {
    expect(bullBoardHost(null)).toBe('127.0.0.1');
  });

  it('listens on every interface when a secret protects it', () => {
    expect(bullBoardHost(SECRET)).toBe('0.0.0.0');
  });
});

describe('buildBullBoardServer with a secret', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildBullBoardServer([], SECRET);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it.each(DASHBOARD_PATHS)(
    'returns 401 and a Basic challenge without credentials: %s',
    async (url) => {
      const res = await server.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic /);
    },
  );

  it('returns 401 before routing, so unknown paths reveal nothing', async () => {
    const res = await server.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['a wrong bearer token', { authorization: 'Bearer wrong' }],
    ['a truncated secret', { authorization: `Bearer ${SECRET.slice(0, -1)}` }],
    ['a wrong X-Admin-Secret', { 'x-admin-secret': 'wrong' }],
    ['the secret as the Basic username', { authorization: basic(SECRET, '') }],
    ['the secret without an auth scheme', { authorization: SECRET }],
  ])('returns 401 with %s', async (_label, headers) => {
    for (const url of DASHBOARD_PATHS) {
      const res = await server.inject({ method: 'GET', url, headers });
      expect(res.statusCode).toBe(401);
    }
  });

  it.each([
    ['a bearer token', { authorization: `Bearer ${SECRET}` }],
    ['X-Admin-Secret', { 'x-admin-secret': SECRET }],
    ['Basic auth (any username)', { authorization: basic('ops', SECRET) }],
    [
      'a correct X-Admin-Secret next to a wrong bearer',
      { authorization: 'Bearer wrong', 'x-admin-secret': SECRET },
    ],
  ])('serves the dashboard with %s', async (_label, headers) => {
    for (const url of DASHBOARD_PATHS) {
      const res = await server.inject({ method: 'GET', url, headers });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('buildBullBoardServer without a secret (local development)', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildBullBoardServer([], null);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it.each(DASHBOARD_PATHS)(
    'serves the dashboard with no credentials: %s',
    async (url) => {
      const res = await server.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
    },
  );
});
