import type {
  FastifyInstance,
  RawRequestDefaultExpression,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

/** JSON and form bodies. File uploads go straight to S3 or through multipart's own limits. */
export const BODY_LIMIT_BYTES = 1024 * 1024;
/** Stripe events are a few KB; anything near this is not Stripe. */
export const STRIPE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * Server options shared by main.ts and the integration test app. A request that hasn't finished
 * arriving in 60 seconds is dropped (slow-body attacks), a socket silent for 2 minutes is closed
 * (the ALB has given up on it after 60), and idle keep-alive connections outlive the ALB's
 * 60-second idle timeout, so the ALB never reuses a socket the API has just closed.
 */
export const HTTP_SERVER_OPTIONS = {
  bodyLimit: BODY_LIMIT_BYTES,
  connectionTimeout: 120_000,
  requestTimeout: 60_000,
  keepAliveTimeout: 65_000,
} as const satisfies FastifyServerOptions;

/** Inbound request ids are kept only if they look like one; anything else could forge or break logs. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** The caller's `x-request-id` (or `x-trace-id`) when it is well-formed, else a fresh UUID. */
export function resolveRequestId(req: RawRequestDefaultExpression): string {
  for (const header of ['x-request-id', 'x-trace-id']) {
    const value = req.headers[header];
    if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value)) {
      return value;
    }
  }
  return randomUUID();
}

/**
 * Proxies in front of the API whose `X-Forwarded-For` entries are trusted: 1 behind the ALB, 0
 * when reached directly. `request.ip` is then the address the outermost trusted proxy saw; any
 * entries the client wrote further left are ignored.
 */
export function trustProxyHopsFromEnv(env: NodeJS.ProcessEnv): number {
  const hops = Number.parseInt(env.TRUST_PROXY_HOPS ?? '0', 10);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/** Everything main.ts and the integration test app pass to the Fastify adapter. */
export function httpServerOptions(
  trustProxyHops: number,
): FastifyServerOptions {
  return {
    ...HTTP_SERVER_OPTIONS,
    trustProxy: trustProxyHops,
    // Ids come only from genReqId, which validates the inbound header
    requestIdHeader: false,
    genReqId: resolveRequestId,
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
};

class PayloadTooLargeError extends Error {
  readonly statusCode = 413;
  readonly code = 'FST_ERR_CTP_BODY_TOO_LARGE';
}

/**
 * Security headers and the request id on every response, and the raw body for Stripe signature checks, captured
 * only on the webhook's own path and capped, so no other route buffers a body in memory.
 */
export function installHttpHardening(
  fastify: FastifyInstance,
  apiPrefix: string,
): void {
  const stripeWebhookPath = `/${apiPrefix}/v1/stripe/webhook`;

  fastify.addHook(
    'onSend',
    (request: FastifyRequest, reply: FastifyReply, _payload, done) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!reply.hasHeader(name)) reply.header(name, value);
      }
      // The request id (validated or generated), so callers can quote it to support
      reply.header('x-trace-id', request.id);
      done();
    },
  );

  fastify.addHook(
    'preParsing',
    async (
      request: FastifyRequest & { rawBody?: Buffer },
      _reply: FastifyReply,
      payload: NodeJS.ReadableStream,
    ): Promise<NodeJS.ReadableStream> => {
      const pathname = (request.raw.url ?? '').split('?')[0];
      if (request.method !== 'POST' || pathname !== stripeWebhookPath) {
        return payload;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of payload) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > STRIPE_WEBHOOK_BODY_LIMIT_BYTES) {
          throw new PayloadTooLargeError('Request body is too large');
        }
        chunks.push(buffer);
      }
      request.rawBody = Buffer.concat(chunks);
      // Downstream parsing still needs the bytes
      return Readable.from(request.rawBody);
    },
  );
}
