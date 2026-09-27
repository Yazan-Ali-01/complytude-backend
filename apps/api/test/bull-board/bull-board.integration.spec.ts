import { QUEUE_NAMES } from '@lib/queue';
import { FastifyInstance } from 'fastify';
import { AddressInfo } from 'node:net';
import {
  BULL_BOARD_BASE_PATH,
  startBullBoardServer,
} from 'src/bull-board/bull-board.server';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const SECRET = 'integration-bull-board-secret-0123456789';

function dashboardUrl(server: FastifyInstance, path = ''): string {
  const { port } = server.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}${BULL_BOARD_BASE_PATH}${path}`;
}

describe('Bull Board', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  it('is not mounted on the public API listener by any Nest module', async () => {
    const publicServer = app.app
      .getHttpAdapter()
      .getInstance() as FastifyInstance;
    for (const url of [
      BULL_BOARD_BASE_PATH,
      `${BULL_BOARD_BASE_PATH}/api/queues`,
    ]) {
      const res = await publicServer.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
  });

  describe('with a secret (every deployed environment)', () => {
    let server: FastifyInstance;

    beforeAll(async () => {
      server = await startBullBoardServer(app.app, {
        adminSecret: SECRET,
        port: 0,
      });
    });

    afterAll(async () => {
      if (server) await server.close();
    });

    it('returns 401 over HTTP without the secret', async () => {
      for (const path of ['', '/api/queues']) {
        expect((await fetch(dashboardUrl(server, path))).status).toBe(401);
        const wrong = await fetch(dashboardUrl(server, path), {
          headers: { authorization: 'Bearer wrong' },
        });
        expect(wrong.status).toBe(401);
      }
    });

    it('lists every application queue with the secret', async () => {
      const res = await fetch(dashboardUrl(server, '/api/queues'), {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { queues: { name: string }[] };
      expect(body.queues.map((queue) => queue.name).sort()).toEqual(
        Object.values(QUEUE_NAMES).sort(),
      );
    });
  });

  describe('without a secret (local development)', () => {
    let server: FastifyInstance;

    beforeAll(async () => {
      server = await startBullBoardServer(app.app, {
        adminSecret: null,
        port: 0,
      });
    });

    afterAll(async () => {
      if (server) await server.close();
    });

    it('listens on loopback only', () => {
      const addresses = server.addresses();
      expect(addresses.length).toBeGreaterThan(0);
      for (const { address } of addresses) {
        expect(['127.0.0.1', '::1']).toContain(address);
      }
    });

    it('serves the dashboard without credentials', async () => {
      const res = await fetch(dashboardUrl(server, '/api/queues'));
      expect(res.status).toBe(200);
    });
  });
});
