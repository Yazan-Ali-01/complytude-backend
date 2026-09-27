import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { getQueueToken, QUEUE_NAMES, type Queue } from '@lib/queue';
import { INestApplicationContext } from '@nestjs/common';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

export const BULL_BOARD_BASE_PATH = '/admin/queues';

export interface BullBoardServerOptions {
  /** Shared admin secret. `null` leaves the dashboard open, which only local development allows. */
  adminSecret: string | null;
  port: number;
}

/**
 * Constant-time secret check. Both sides are hashed first so the buffers always have the same
 * length: the secret's length isn't leaked and `timingSafeEqual` can't throw.
 */
export function isBullBoardSecretValid(
  presented: string | undefined,
  secret: string,
): boolean {
  if (!presented) return false;
  const digest = (value: string): Buffer =>
    createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

/**
 * An open dashboard (no secret) listens on loopback only, so it is never reachable from another
 * machine, even on a deployment that forgot `NODE_ENV=production`.
 */
export function bullBoardHost(adminSecret: string | null): string {
  return adminSecret ? '0.0.0.0' : '127.0.0.1';
}

/**
 * Secrets a request presents: `Authorization: Bearer <secret>`, `X-Admin-Secret: <secret>`, or
 * HTTP Basic with the secret as the password (any username), which lets a browser use the UI.
 */
function presentedSecrets(request: FastifyRequest): string[] {
  const secrets: string[] = [];

  const headerSecret = request.headers['x-admin-secret'];
  if (typeof headerSecret === 'string') secrets.push(headerSecret);

  const match = /^(\w+)\s+(.+)$/.exec(request.headers.authorization ?? '');
  if (match) {
    const [, scheme, credentials] = match;
    if (scheme.toLowerCase() === 'bearer') {
      secrets.push(credentials);
    } else if (scheme.toLowerCase() === 'basic') {
      const decoded = Buffer.from(credentials, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator >= 0) secrets.push(decoded.slice(separator + 1));
    }
  }

  return secrets;
}

/** Bull Board on a standalone Fastify instance, never on the public API listener. */
export async function buildBullBoardServer(
  queues: Queue[],
  adminSecret: string | null,
): Promise<FastifyInstance> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  const server = Fastify();

  if (adminSecret) {
    server.addHook('onRequest', async (request, reply) => {
      const authorized = presentedSecrets(request).some((presented) =>
        isBullBoardSecretValid(presented, adminSecret),
      );
      if (authorized) return;
      return reply
        .code(401)
        .header('www-authenticate', 'Basic realm="Bull Board", charset="UTF-8"')
        .send({
          statusCode: 401,
          error: 'Unauthorized',
          message:
            'Bull Board requires Authorization: Bearer <BULL_BOARD_ADMIN_SECRET>, X-Admin-Secret, or Basic auth with the secret as the password',
        });
    });
  }

  await server.register(serverAdapter.registerPlugin(), {
    prefix: BULL_BOARD_BASE_PATH,
  });
  return server;
}

/** Builds the dashboard for every queue in `QUEUE_NAMES` and starts listening on its own port. */
export async function startBullBoardServer(
  app: INestApplicationContext,
  { adminSecret, port }: BullBoardServerOptions,
): Promise<FastifyInstance> {
  const queues = Object.values(QUEUE_NAMES).map((name) =>
    app.get<Queue>(getQueueToken(name)),
  );
  const server = await buildBullBoardServer(queues, adminSecret);
  await server.listen({ host: bullBoardHost(adminSecret), port });
  return server;
}
