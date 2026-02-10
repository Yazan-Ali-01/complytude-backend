# Shared Logger Module

Centralized structured logging module for the Complytude platform using Pino and nestjs-pino.

## Overview

The `LoggerModule` provides consistent, high-performance structured logging across all Complytude services (API Gateway, Worker AI, Worker Ingestion). It uses Pino for JSON-structured logs with automatic request correlation, tenant context injection, and service identification.

## Features

- ✅ **Structured JSON Logging** - Machine-readable NDJSON format for log aggregation
- ✅ **Request Correlation** - Automatic `trace_id` generation for distributed tracing
- ✅ **Tenant Context** - Automatic `tenant_id` injection from authenticated requests
- ✅ **Service Identification** - `service_name` field for multi-service architecture
- ✅ **Auto HTTP Logging** - Automatic request/response logging with intelligent filtering
- ✅ **Environment-Based** - Pretty-print in dev, NDJSON in production
- ✅ **High Performance** - Pino is 5x faster than Winston, 2x faster than Bunyan
- ✅ **Security** - Excludes sensitive headers (authorization, cookies) from logs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
│  ┌──────────────┬──────────────┬──────────────────────────────┐ │
│  │   API        │  Worker AI   │  Worker Ingestion            │ │
│  │  Gateway     │              │                              │ │
│  └──────┬───────┴──────┬───────┴──────────┬───────────────────┘ │
│         │              │                  │                     │
│         └──────────────┴──────────────────┘                     │
│                        │                                        │
│                   LoggerModule                                  │
│            (libs/shared/src/logger)                             │
│                        │                                        │
│         ┌──────────────┴──────────────┐                         │
│         │                             │                         │
│    Pino Logger                   Pino HTTP                      │
│    (Application Logs)            (Request Logs)                 │
└─────────┴─────────────────────────────┴─────────────────────────┘
         │                             │
         └─────────────┬───────────────┘
                       │
                    stdout
                  (NDJSON Format)
                       │
         ┌─────────────┴───────────────┐
         │                             │
    Log Aggregator            Docker Logs
  (Datadog/ELK/CloudWatch)   (Production)
```

## Installation

The LoggerModule is already installed as part of `@complytude/shared`. No additional installation required.

## Usage

### Basic Setup (forRoot)

```typescript
// app.module.ts
import { LoggerModule } from '@complytude/shared';

@Module({
  imports: [
    LoggerModule.forRoot({
      serviceName: 'gateway',
      logLevel: 'info',
      prettyPrint: false,
      autoLogging: true,
    }),
  ],
})
export class AppModule {}
```

### Async Setup (forRootAsync) - Recommended

```typescript
// app.module.ts
import { LoggerModule } from '@complytude/shared';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loggerConfig],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: configService.get<string>('logger.serviceName'),
        logLevel: configService.get<string>('logger.level'),
        prettyPrint: configService.get<boolean>('logger.prettyPrint'),
        autoLogging: configService.get<boolean>('logger.autoLogging'),
      }),
    }),
  ],
})
export class AppModule {}
```

### Bootstrap Integration

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create app with buffered logs
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until Pino is ready
  });

  // Replace default logger with Pino
  app.useLogger(app.get(PinoLogger));

  await app.listen(3000);
}

bootstrap();
```

### Logging in Services

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  doSomething() {
    // Info log
    this.logger.log('Operation started');

    // Debug log (only visible if LOG_LEVEL=debug)
    this.logger.debug('Processing item', { itemId: '123' });

    // Warning log
    this.logger.warn('Resource usage high', { cpu: 85 });

    // Error log
    try {
      // ... some operation
    } catch (error) {
      this.logger.error('Operation failed', error.stack);
    }
  }
}
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Service identification
SERVICE_NAME=gateway

# Log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=debug

# Pretty-print for development (true/false)
LOG_PRETTY=true

# Auto-log HTTP requests (true/false)
LOG_AUTO_LOGGING=true
```

### Configuration File

```typescript
// config/logger.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('logger', () => ({
  serviceName: process.env.SERVICE_NAME || 'gateway',
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: process.env.LOG_PRETTY === 'true',
  autoLogging: process.env.LOG_AUTO_LOGGING !== 'false',
}));
```

### Validation Schema

```typescript
// config/env.schema.ts
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  SERVICE_NAME: Joi.string().default('gateway'),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  LOG_PRETTY: Joi.boolean().default(false),
  LOG_AUTO_LOGGING: Joi.boolean().default(true),
});
```

## Log Structure

### Required Fields (Always Present)

```json
{
  "level": "info",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "Request completed",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway"
}
```

### Conditional Fields

```json
{
  "level": "info",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "Document created",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway",
  "tenant_id": "tenant-uuid-here",
  "user_id": "user-uuid-here"
}
```

### HTTP Request Logs (Auto-logged)

```json
{
  "level": "info",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "POST /api/documents completed",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway",
  "tenant_id": "tenant-uuid-here",
  "req": {
    "id": "abc-123-def-456",
    "method": "POST",
    "url": "/api/documents",
    "remoteAddress": "192.168.1.10",
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json"
    }
  },
  "res": {
    "statusCode": 201,
    "responseTime": 45
  }
}
```

### Error Logs

```json
{
  "level": "error",
  "time": "2026-02-08T10:30:00.123Z",
  "msg": "Database query failed",
  "trace_id": "abc-123-def-456",
  "service_name": "gateway",
  "err": {
    "type": "QueryFailedError",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at ..."
  }
}
```

## Log Levels

| Level | Value | Usage | Example |
|-------|-------|-------|---------|
| `fatal` | 60 | System crash, requires immediate attention | Database unreachable |
| `error` | 50 | Error that needs investigation | API call failed |
| `warn` | 40 | Warning, but system continues | High memory usage |
| `info` | 30 | **Production default** - General information | Request completed |
| `debug` | 20 | **Development default** - Debugging information | Query executed |
| `trace` | 10 | Very detailed debugging | Variable values |

### Recommendations

- **Production**: `LOG_LEVEL=info` (balanced verbosity)
- **Staging**: `LOG_LEVEL=debug` (more details for testing)
- **Development**: `LOG_LEVEL=debug` (full visibility)
- **Troubleshooting**: `LOG_LEVEL=trace` (maximum detail)

## Auto HTTP Logging

The logger automatically logs all HTTP requests and responses with intelligent filtering.

### Filtered Endpoints (No Logging)

These endpoints are automatically excluded to reduce noise:

- `/health`
- `/api/health`
- `/metrics`
- `/` (root)

### Custom Filtering

To modify filtering, update `pino.config.ts`:

```typescript
autoLogging: {
  ignore: (req: any) => {
    // Add custom filtering logic
    const ignoredPaths = ['/health', '/metrics', '/favicon.ico'];
    return ignoredPaths.includes(req.url);
  },
}
```

## Tenant Context Injection

The logger automatically extracts `tenant_id` from authenticated requests.

### Automatic Extraction

```typescript
// In pino.config.ts
customProps: (req: any, res: any) => {
  const customProps = {
    trace_id: req.id,
    service_name: serviceName,
  };

  // Extract from JWT auth
  if (req.auth?.tenant?.tenantId) {
    customProps.tenant_id = req.auth.tenant.tenantId;
    customProps.user_id = req.auth.tenant.userId;
  }

  return customProps;
},
```

### Manual Injection

For non-HTTP logs (background jobs, workers):

```typescript
this.logger.log({
  msg: 'Processing job',
  tenant_id: job.tenantId,
  job_id: job.id,
});
```

## Request Correlation (Distributed Tracing)

Every request gets a unique `trace_id` for correlation across services.

### How It Works

1. **Client sends request** → May include `x-request-id` header
2. **Gateway receives request** → Generates or uses existing `trace_id`
3. **Gateway logs request** → Includes `trace_id` in logs
4. **Gateway calls Worker** → Forwards `x-request-id` header
5. **Worker logs processing** → Uses same `trace_id`
6. **Gateway logs response** → Same `trace_id`

### Trace ID Flow

```
Client Request
  ↓
  x-request-id: abc-123
  ↓
┌─────────────────────┐
│  API Gateway        │
│  trace_id: abc-123  │ → Log: "Request received"
└─────────────────────┘
  ↓
  Forward x-request-id
  ↓
┌─────────────────────┐
│  Worker AI          │
│  trace_id: abc-123  │ → Log: "Processing document"
└─────────────────────┘
  ↓
┌─────────────────────┐
│  API Gateway        │
│  trace_id: abc-123  │ → Log: "Response sent"
└─────────────────────┘
```

### Querying Logs by Trace ID

In your log aggregator (Datadog, ELK, CloudWatch):

```bash
# Find all logs for a specific request
trace_id:"abc-123-def-456"

# Find all Gateway logs for this request
trace_id:"abc-123-def-456" AND service_name:"gateway"

# Find errors in this request chain
trace_id:"abc-123-def-456" AND level:"error"
```

## Performance Considerations

### Benchmarks

Pino is exceptionally fast:

- **Pino**: ~66,000 ops/sec
- **Winston**: ~14,000 ops/sec
- **Bunyan**: ~31,000 ops/sec

### Asynchronous Logging (Production)

In production, logs are written asynchronously to avoid blocking the event loop:

```typescript
// pino.config.ts
{
  sync: false, // Asynchronous in production
  minLength: 4096, // Buffer before writing
}
```

### Synchronous Logging (Development)

In development, logs are synchronous for immediate visibility:

```typescript
{
  sync: true, // Synchronous in development
}
```

## Development vs Production

### Development Mode

```bash
# .env
NODE_ENV=development
LOG_LEVEL=debug
LOG_PRETTY=true
```

**Output (Pretty-Printed):**

```
[10:30:00.123] INFO (Bootstrap): 🚀 Application is running
    trace_id: "abc-123"
    service_name: "gateway"
```

### Production Mode

```bash
# .env
NODE_ENV=production
LOG_LEVEL=info
LOG_PRETTY=false
```

**Output (NDJSON):**

```json
{"level":"info","time":"2026-02-08T10:30:00.123Z","msg":"🚀 Application is running","trace_id":"abc-123","service_name":"gateway"}
```

## Best Practices

### ✅ DO

- **Use structured logging** with context objects:
  ```typescript
  this.logger.log('User created', { userId, email, role });
  ```

- **Include relevant context**:
  ```typescript
  this.logger.error('Payment failed', { 
    orderId, 
    amount, 
    error: error.message 
  });
  ```

- **Use appropriate log levels**:
  ```typescript
  this.logger.debug('Cache miss'); // Debug info
  this.logger.info('Order placed'); // Business events
  this.logger.warn('Rate limit approaching'); // Warnings
  this.logger.error('Payment gateway timeout', error.stack); // Errors
  ```

- **Log business events** (order placed, user registered, payment processed)

- **Log performance metrics** (slow queries, high CPU usage)

### ❌ DON'T

- **Don't log sensitive data**:
  ```typescript
  // ❌ Bad
  this.logger.log('User login', { password, creditCard });
  
  // ✅ Good
  this.logger.log('User login', { userId, timestamp });
  ```

- **Don't log in tight loops**:
  ```typescript
  // ❌ Bad
  for (const item of items) {
    this.logger.debug('Processing item', item); // 10,000 log entries!
  }
  
  // ✅ Good
  this.logger.debug('Processing batch', { count: items.length });
  // ... process items ...
  this.logger.info('Batch processed', { count: items.length, duration });
  ```

- **Don't use string concatenation**:
  ```typescript
  // ❌ Bad
  this.logger.log('User ' + userId + ' created order ' + orderId);
  
  // ✅ Good
  this.logger.log('User created order', { userId, orderId });
  ```

- **Don't log health check spam** (automatically filtered by LoggerModule)

## Troubleshooting

### Logs Not Appearing

**Problem**: No logs are being output

**Solutions**:
1. Check `LOG_LEVEL` - set to `debug` for more visibility
2. Verify `app.useLogger(app.get(PinoLogger))` is called in `main.ts`
3. Ensure `bufferLogs: true` is set in `NestFactory.create()`
4. Check that `LoggerModule.forRootAsync()` is imported in `AppModule`

### Pretty Print Not Working

**Problem**: Logs are JSON in development

**Solutions**:
1. Check `LOG_PRETTY=true` in `.env`
2. Verify `NODE_ENV=development`
3. Install `pino-pretty`: `pnpm install -D pino-pretty`
4. Restart the application

### Tenant Context Not Appearing

**Problem**: `tenant_id` missing from logs

**Solutions**:
1. Verify user is authenticated with tenant token
2. Check that `request.auth.tenant` is set by JWT guard
3. Ensure request is passing through authentication middleware
4. Add custom `tenantExtractor` in LoggerModule configuration

### Trace ID Not Correlating

**Problem**: Different `trace_id` for same request across services

**Solutions**:
1. Ensure `x-request-id` header is forwarded between services
2. Verify `genReqId` uses `req.headers['x-request-id']`
3. Check HTTP client forwards headers: `headers: { 'x-request-id': traceId }`

## Migration from Default Logger

### Before (Default Logger)

```typescript
import { Logger } from '@nestjs/common';

const logger = new Logger('MyService');
logger.log('Something happened');
```

**Output:**
```
[Nest] 12345  - 02/08/2026, 10:30:00 AM     LOG [MyService] Something happened
```

### After (Pino Logger)

```typescript
import { Logger } from '@nestjs/common';

const logger = new Logger('MyService');
logger.log('Something happened');
```

**Output (Production NDJSON):**
```json
{"level":"info","time":"2026-02-08T10:30:00.123Z","msg":"Something happened","trace_id":"abc-123","service_name":"gateway","context":"MyService"}
```

**Output (Development Pretty):**
```
[10:30:00.123] INFO (MyService): Something happened
    trace_id: "abc-123"
    service_name: "gateway"
```

### No Code Changes Required!

The LoggerModule is a drop-in replacement. All existing `Logger` instances automatically use Pino under the hood.

## Related Documentation

- [Architecture Documentation](../../../../docs/ARCHITECTURE.md) - System architecture overview
- [API Development Guide](../../../../apps/api/docs/DEVELOPMENT.md) - API development workflow
- [Infrastructure Logging Guide](../../../../infra/logging-module/README.md) - Production logging setup

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-08 | Initial implementation with Pino |

---

**Last Updated**: February 8, 2026
**Module Version**: 1.0.0
**Dependencies**: `nestjs-pino@^4.3.0`, `pino@^9.6.0`, `pino-http@^10.3.0`
