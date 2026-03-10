import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { QUEUE_NAMES } from '@lib/queue';
// eslint-disable-next-line no-restricted-imports
import { getQueueToken } from '@nestjs/bullmq';
import {
  Logger,
  RequestMethod,
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

  // Set global prefix for all routes, excluding infrastructure endpoints
  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health/(.*)', method: RequestMethod.ALL },
      { path: 'health', method: RequestMethod.ALL },
    ],
  });

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
  // TODO: Protect with platform RBAC or basic auth before production
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

  await app.register(bullBoardAdapter.registerPlugin(), {
    prefix: '/admin/queues',
  });

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
  // Swagger docs remain unversioned at /docs for convenience
  SwaggerModule.setup('docs', app, document);

  // Enable graceful shutdown — fires onModuleDestroy on SIGTERM/SIGINT,
  // draining active BullMQ jobs before exit
  app.enableShutdownHooks();

  // Start server
  await app.listen(port, '0.0.0.0');

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}/v1`,
  );
  logger.log(`📚 Swagger documentation: http://localhost:${port}/docs`);
  logger.log(`🌍 Environment: ${environment}`);
}

void bootstrap();
