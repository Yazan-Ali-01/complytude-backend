import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
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
 * Security headers on every response, and the raw body for Stripe signature checks, captured
 * only on the webhook's own path and capped, so no other route buffers a body in memory.
 */
export function installHttpHardening(
  fastify: FastifyInstance,
  apiPrefix: string,
): void {
  const stripeWebhookPath = `/${apiPrefix}/v1/stripe/webhook`;

  fastify.addHook(
    'onSend',
    (_request: FastifyRequest, reply: FastifyReply, _payload, done) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!reply.hasHeader(name)) reply.header(name, value);
      }
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
