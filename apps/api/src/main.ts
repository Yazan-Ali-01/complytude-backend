import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { QUEUE_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { getQueueToken } from '@nestjs/bullmq';
import {
  Logger as NestLogger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import {
  IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
  IDENTITY_TOKEN_COOKIE_NAME,
  TENANT_ACCESS_TOKEN_COOKIE_NAME,
  TENANT_REFRESH_TOKEN_COOKIE_NAME,
} from './common/swagger/common';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      return (
        (req.headers['x-request-id'] as string) ??
        (req.headers['x-trace-id'] as string) ??
        randomUUID()
      );
    },
  });

  fastifyAdapter
    .getInstance()
    .addHook('onSend', (req, reply, _payload, done) => {
      reply.header('x-trace-id', req.id);
      done();
    });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const logger = new NestLogger('Bootstrap');

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api';
  const corsOrigins = configService.get<string[]>('app.corsOrigins') || [
    'http://localhost:3000',
  ];
  const environment =
    configService.get<string>('app.environment') || 'development';
  const maxFileSize =
    configService.get<number>('storage.upload.maxFileSize') || 10485760; // 10MB

  // Capture raw body for Stripe webhook signature verification.
  // Using preParsing hook instead of replacing the content type parser so
  // NestJS's own JSON parser registration is never disturbed.
  // The hook stashes the raw bytes on request.rawBody for webhook routes only;
  // all other routes are left completely untouched.

  const fastifyInstance = app.getHttpAdapter().getInstance() as any;
  fastifyInstance.addHook(
    'preParsing',
    async (request: any, _reply: any, payload: any) => {
      const url: string = request.url ?? request.raw?.url ?? '';
      if (!url.includes('/stripe/webhook')) {
        return payload;
      }

      const chunks: Buffer<ArrayBuffer>[] = [];
      for await (const chunk of payload) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? (chunk as Buffer<ArrayBuffer>)
            : Buffer.from(chunk as ArrayBuffer),
        );
      }
      request.rawBody = Buffer.concat(chunks);

      // Return a fresh readable so downstream parsing still has the bytes
      const { Readable } = await import('stream');
      return Readable.from(request.rawBody as Buffer);
    },
  );

  // Register cookie plugin for HTTP-only cookie authentication
  await app.register(cookie);

  // Register multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: maxFileSize,
      files: 1,
    },
  });

  // Enable CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Set global prefix for all routes
  app.setGlobalPrefix(apiPrefix);

  // Enable URI-based API versioning (/api/v1/...)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Bull Board — queue monitoring dashboard at /admin/queues
  const bullBoardAdminSecret = configService.get<string | null>(
    'app.bullBoardAdminSecret',
  );
  const bullBoardAdapter = new BullBoardFastifyAdapter();
  bullBoardAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(app.get(getQueueToken(QUEUE_NAMES.AI_PROCESSING))),
      new BullMQAdapter(app.get(getQueueToken(QUEUE_NAMES.DATA_INGESTION))),
      new BullMQAdapter(
        app.get(getQueueToken(QUEUE_NAMES.ENTITLEMENT_PROCESSING)),
      ),
    ],
    serverAdapter: bullBoardAdapter,
  });

  // Protect Bull Board when BULL_BOARD_ADMIN_SECRET is set
  const bullBoardPlugin = bullBoardAdapter.registerPlugin();
  if (bullBoardAdminSecret) {
    const wrappedPlugin = async (instance: any) => {
      instance.addHook('onRequest', async (request: any, reply: any) => {
        const authHeader = request.headers?.authorization;
        const bearer = authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;
        const headerSecret = request.headers?.['x-admin-secret'];
        const valid =
          bearer === bullBoardAdminSecret ||
          headerSecret === bullBoardAdminSecret;
        if (!valid) {
          await reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message:
              'Bull Board requires Authorization: Bearer <BULL_BOARD_ADMIN_SECRET> or X-Admin-Secret header',
          });
        }
      });
      await instance.register(bullBoardPlugin);
    };
    await app.register(wrappedPlugin, { prefix: '/admin/queues' });
  } else {
    await app.register(bullBoardPlugin, { prefix: '/admin/queues' });
  }

  // ========================================================================
  // SWAGGER CONFIGURATION - Dev/staging only; disabled in production
  // ========================================================================
  if (environment !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Complytude API')
      .setDescription(
        'Complytude compliance platform API - Multi-tenant document analysis and compliance checking system.\n\n' +
          '## Authentication Flow\n' +
          '1. **Login** (`POST /auth/login`) → Receive identity tokens\n' +
          '2. **Select Tenant** (`POST /auth/tenant-switch`) → Receive tenant tokens\n' +
          '3. **API Calls** → Browser automatically sends cookies\n' +
          '4. **Token Refresh** → Use refresh endpoints when access tokens expire\n\n' +
          '## Cookie-Based Authentication\n' +
          'All authentication uses HTTP-only cookies for security. Tokens are automatically included in requests.\n\n' +
          '**Identity Tokens** (for tenant selection):\n' +
          '- `identityAccessToken` - 15 min expiry\n' +
          '- `identityRefreshToken` - 14 day expiry\n\n' +
          '**Tenant Tokens** (for API access):\n' +
          '- `tenantAccessToken` - 30 min expiry\n' +
          '- `tenantRefreshToken` - 14 day expiry',
      )
      .setVersion('1.0.0')
      .setContact(
        'Complytude Support',
        'https://complytude.com',
        'support@complytude.com',
      )
      .setLicense('Proprietary', 'https://complytude.com/license')
      .addServer(
        `http://localhost:${port}/${apiPrefix}/v1`,
        'Local Development',
      )
      .addServer('https://api-staging.complytude.com/api/v1', 'Staging')
      .addServer('https://api.complytude.com/api/v1', 'Production')
      // Cookie-based authentication definitions - ALL 4 TYPES
      .addCookieAuth(
        IDENTITY_TOKEN_COOKIE_NAME,
        {
          type: 'apiKey',
          in: 'cookie',
          name: IDENTITY_TOKEN_COOKIE_NAME,
          description:
            'Identity access token (15 min) - Used for tenant selection and system admin operations',
        },
        IDENTITY_TOKEN_COOKIE_NAME,
      )
      .addCookieAuth(
        IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
        {
          type: 'apiKey',
          in: 'cookie',
          name: IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
          description:
            'Identity refresh token (14 days) - Used to renew identity access tokens',
        },
        IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
      )
      .addCookieAuth(
        TENANT_ACCESS_TOKEN_COOKIE_NAME,
        {
          type: 'apiKey',
          in: 'cookie',
          name: TENANT_ACCESS_TOKEN_COOKIE_NAME,
          description:
            'Tenant access token (30 min) - Used for tenant-scoped API operations',
        },
        TENANT_ACCESS_TOKEN_COOKIE_NAME,
      )
      .addCookieAuth(
        TENANT_REFRESH_TOKEN_COOKIE_NAME,
        {
          type: 'apiKey',
          in: 'cookie',
          name: TENANT_REFRESH_TOKEN_COOKIE_NAME,
          description:
            'Tenant refresh token (14 days) - Used to renew tenant access tokens',
        },
        TENANT_REFRESH_TOKEN_COOKIE_NAME,
      )
      // Add common tags for organization
      .addTag('Authentication', 'User authentication and session management')
      .addTag('Tenants', 'Multi-tenant organization management')
      .addTag('Users', 'User account management')
      .addTag('Documents', 'Document upload and analysis')
      .addTag('Templates', 'Compliance template management')
      .addTag('Rulesets', 'Compliance ruleset management')
      .addTag('Authorities', 'Regulatory authority management')
      .addTag('Categories', 'Document category management')
      .addTag('Subscriptions', 'Billing and subscription management')
      .addTag('Storage', 'File storage and presigned URLs')
      .addTag('Health', 'System health checks')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => {
        // Generate unique operation IDs to prevent duplicates
        // Format: ControllerName_methodName (e.g., Auth_login, Documents_analyze)
        const controller = controllerKey.replace('Controller', '');
        return `${controller}_${methodKey}`;
      },
      deepScanRoutes: true, // Ensure all routes are scanned
    });

    // Serve Swagger UI at /docs
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'Complytude API Documentation',
      customCss: '.swagger-ui .topbar { display: none }', // Hide Swagger topbar
      swaggerOptions: {
        persistAuthorization: true, // Remember auth tokens in browser
        displayRequestDuration: true,
        filter: true, // Enable search
        tryItOutEnabled: true,
      },
    });

    // ========================================================================
    // CRITICAL: JSON ENDPOINT FOR APIDOG SYNC
    // ========================================================================
    // Expose OpenAPI JSON at /api/docs-json (accessible to Apidog)
    app.getHttpAdapter().get(`/${apiPrefix}/docs-json`, (req, reply) => {
      reply.type('application/json').send(document);
    });

    // Export JSON to file system for version control (development only)
    if (environment === 'development') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportDir = join(process.cwd(), 'apps', 'api', 'docs', 'swagger');

      try {
        // Export latest version (always overwrites)
        const latestPath = join(exportDir, 'openapi-latest.json');
        writeFileSync(latestPath, JSON.stringify(document, null, 2));
        logger.log(`📄 OpenAPI spec exported: ${latestPath}`);

        // Export timestamped backup (never overwrites)
        const backupPath = join(exportDir, `openapi-${timestamp}.json`);
        writeFileSync(backupPath, JSON.stringify(document, null, 2));
        logger.log(`💾 OpenAPI backup created: ${backupPath}`);
      } catch (error) {
        logger.warn(
          `⚠️  Failed to export OpenAPI spec to file: ${error.message}`,
        );
      }
    }
  } // end: if (environment !== 'production')

  // Enable graceful shutdown — fires onModuleDestroy on SIGTERM/SIGINT,
  // draining active BullMQ jobs before exit
  app.enableShutdownHooks();

  // Start server
  await app.listen(port, '0.0.0.0');

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}/v1`,
  );
  if (environment !== 'production') {
    logger.log(`📚 Swagger UI: http://localhost:${port}/docs`);
    logger.log(
      `📋 OpenAPI JSON: http://localhost:${port}/${apiPrefix}/docs-json`,
    );
  }
  logger.log(`🌍 Environment: ${environment}`);
}

void bootstrap();
