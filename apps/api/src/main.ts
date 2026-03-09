import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import { QUEUE_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { getQueueToken } from '@nestjs/bullmq';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import {
  TENANT_ACCESS_TOKEN_COOKIE_NAME,
  TENANT_REFRESH_TOKEN_COOKIE_NAME,
} from './common/swagger/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create Fastify adapter
  const fastifyAdapter = new FastifyAdapter();

  // Create Fastify application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    },
  );

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

  // Set global prefix
  app.setGlobalPrefix(apiPrefix);

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

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Complytude API')
    .setDescription('API documentation for Complytude application')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'cookie',
        name: TENANT_ACCESS_TOKEN_COOKIE_NAME,
        description: 'JWT access token stored in http-only cookie',
      },
      TENANT_ACCESS_TOKEN_COOKIE_NAME,
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'cookie',
        name: TENANT_REFRESH_TOKEN_COOKIE_NAME,
        description: 'JWT refresh token stored in http-only cookie',
      },
      TENANT_REFRESH_TOKEN_COOKIE_NAME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Enable graceful shutdown — fires onModuleDestroy on SIGTERM/SIGINT,
  // draining active BullMQ jobs before exit
  app.enableShutdownHooks();

  // Start server
  await app.listen(port, '0.0.0.0');

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(`📚 Swagger documentation: http://localhost:${port}/docs`);
  logger.log(`🌍 Environment: ${environment}`);
}

void bootstrap();
