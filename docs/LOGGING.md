# Logging Architecture

Complytude uses two separate logging streams with distinct purposes, formats, and retention characteristics.

## Two Streams Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        HTTP Request                                  │
│                           │                                          │
│                           ▼                                          │
│  ┌─────────────────────────────────────────────┐                     │
│  │              Gateway (API)                   │                     │
│  │                                              │                     │
│  │  ┌──────────────┐   ┌─────────────────────┐  │                     │
│  │  │ System Logs   │   │ Audit Trail         │  │                     │
│  │  │ (Pino/stdout) │   │ (@Audit → Postgres) │  │                     │
│  │  └──────┬───────┘   └────────┬────────────┘  │                     │
│  └─────────┼────────────────────┼───────────────┘                     │
│            │                    │                                      │
│            │    ┌───────────────┘                                      │
│            │    │   trace_id propagated via BullMQ _metadata           │
│            │    │                                                      │
│  ┌─────────┼────┼──────────────────────────┐                          │
│  │         ▼    │       Workers             │                          │
│  │  ┌──────────────┐                        │                          │
│  │  │ System Logs   │   (No audit trail —   │                          │
│  │  │ (Pino/stdout) │    workers don't      │                          │
│  │  └──────────────┘    write audit_logs)   │                          │
│  └──────────────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
```

| Aspect           | System Logs (Pino)                       | Audit Trail                               |
| ---------------- | ---------------------------------------- | ----------------------------------------- |
| **Purpose**      | Debugging, monitoring, alerting          | Compliance, accountability, user activity |
| **Audience**     | Engineers, DevOps                        | Compliance officers, admins, legal        |
| **Destination**  | stdout → log aggregator                  | `audit_logs` table in Postgres            |
| **Trigger**      | Automatic (every request + manual calls) | Explicit (`@Audit()` decorator only)      |
| **Retention**    | Short-term (days–weeks)                  | Long-term (years)                         |
| **Contains PII** | No (redacted)                            | Minimal (actor ID, IP)                    |
| **Blocking**     | No                                       | No (fire-and-forget)                      |

### Why Two Streams?

- **System logs** are noisy, high-volume, and ephemeral — useful for debugging but not for compliance.
- **Audit logs** are curated, business-meaningful events — "who did what, when" for compliance and legal requirements.
- Keeping them separate means system log rotation doesn't affect audit retention, and audit queries aren't buried in debug noise.

---

## System Logging (Pino)

### Library Stack

- **Pino** via `nestjs-pino` (`pino-http` for HTTP, raw Pino for workers)
- **pino-pretty** in development for human-readable output
- **JSON** in production for log aggregator ingestion

### Configuration

```
libs/logger/src/
├── logger.module.ts           # LoggerModule.forRoot({ serviceName, excludeRoutes })
├── logger.config.ts           # Pino configuration factory
├── logger.redaction.ts        # Sensitive field redaction
├── logger.schema.ts           # LOG_LEVEL, SERVICE_NAME env vars
└── interfaces/
    └── logger-options.interface.ts
```

### Service Names

Each application has a unique `service_name` in all log lines:

| Application      | Service Name       | Config Location                                        |
| ---------------- | ------------------ | ------------------------------------------------------ |
| API Gateway      | `gateway`          | `apps/api/src/app.module.ts`                           |
| AI Worker        | `worker-ai`        | `apps/worker-ai/src/worker-ai.module.ts`               |
| Ingestion Worker | `worker-ingestion` | `apps/worker-ingestion/src/worker-ingestion.module.ts` |

### Log Fields

Every log line includes:

| Field          | Source                          | Present In       |
| -------------- | ------------------------------- | ---------------- |
| `service_name` | `LoggerModule.forRoot()`        | All logs         |
| `trace_id`     | Fastify `req.id` → CLS → Pino   | Gateway requests |
| `tenant_id`, `user_id` | `TenantInterceptor` (tenant token) | Gateway requests with a tenant token |
| `trace_id`     | Job `_metadata.traceId` → Pino  | Worker jobs      |
| `tenant_id`    | Job `_metadata.tenantId` → Pino | Worker jobs      |
| `queue_name`   | `job.queueName` → Pino          | Worker jobs      |
| `job_id`       | `job.id` → Pino                 | Worker jobs      |
| `job_name`     | `job.name` → Pino               | Worker jobs      |
| `method`       | HTTP request                    | Gateway requests |
| `url`          | HTTP request                    | Gateway requests |

**Trace id.** `req.id` is the caller's `x-request-id` (or `x-trace-id`) only when it matches
`^[A-Za-z0-9-]{8,64}$`; otherwise the API generates a UUID. It is returned in the `x-trace-id`
response header. (`bootstrap/http-hardening.ts`)

**Client IP.** `request.ip` and the logged `ip` trust only as many `X-Forwarded-For` entries as there
are proxies in front of the API (`TRUST_PROXY_HOPS`: 1 behind the ALB, 0 locally), counted from the
right. Entries the client wrote further left are ignored.

### Log Levels

| Level        | When to Use                       | Examples                                                      |
| ------------ | --------------------------------- | ------------------------------------------------------------- |
| `error`      | Operation failed, needs attention | DB query failed, external API down, job permanently failed    |
| `warn`       | Unexpected but handled            | Access denied, auth failure, retry needed, data inconsistency |
| `log` (info) | Important business operations     | User created, document analyzed, plan changed, job completed  |
| `debug`      | Operational detail for debugging  | Query params, cache hits, intermediate results, job payloads  |

**Rules:**

- Never log at `error` for expected user errors (validation, 404) — use `warn` or skip
- Always include contextual IDs (userId, tenantId, resourceId) in log messages
- Never log passwords, tokens, or raw SQL parameters

### Using the Logger

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async createDocument(tenantId: string, userId: string): Promise<Document> {
    this.logger.log(`Creating document for tenant=${tenantId} user=${userId}`);

    try {
      const doc = await this.repository.create(data);
      this.logger.log(`Document created id=${doc.id} tenant=${tenantId}`);
      return doc;
    } catch (error) {
      this.logger.error(
        `Failed to create document tenant=${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
```

### Route Exclusions

Health check endpoints are excluded from HTTP request logging:

```typescript
LoggerModule.forRoot({
  serviceName: 'gateway',
  excludeRoutes: [
    { path: 'health', method: RequestMethod.ALL },
    { path: 'health/(.*)', method: RequestMethod.ALL },
  ],
}),
```

### Environment Variables

| Variable       | Default                       | Description              |
| -------------- | ----------------------------- | ------------------------ |
| `LOG_LEVEL`    | `debug` (dev), `info` (prod)  | Minimum log level        |
| `SERVICE_NAME` | From `LoggerModule.forRoot()` | Override service name    |
| `NODE_ENV`     | `development`                 | Controls pretty printing |

---

## Audit Logging

### Overview

Audit logging uses an opt-in `@Audit()` decorator on controller methods. Only decorated endpoints produce audit records. Logging is fire-and-forget — it never blocks the response.

### Architecture

```
@Audit('EVENT_NAME')  →  AuditInterceptor  →  AuditService.log()  →  audit_logs table
     (decorator)          (global, no-ops         (fire-and-forget,     (Postgres)
                           without @Audit)         swallows errors)
```

**Key files:**

| Component      | Path                                                    |
| -------------- | ------------------------------------------------------- |
| Decorator      | `apps/api/src/common/decorators/audit.decorator.ts`     |
| Interceptor    | `apps/api/src/common/interceptors/audit.interceptor.ts` |
| Body sanitizer | `apps/api/src/common/utils/audit-sanitize.util.ts`      |
| Service        | `libs/audit/src/audit.service.ts`                       |
| Repository     | `libs/audit/src/audit.repository.ts`                    |
| Types          | `libs/audit/src/audit.types.ts`                         |

### Using the `@Audit()` Decorator

```typescript
import { Audit } from 'src/common/decorators/audit.decorator';

@Controller('contracts')
export class ContractsController {

  // Basic — resourceType auto-derived from @Controller('contracts') → 'contracts'
  @Post()
  @Audit('CONTRACT_CREATED')
  async create(@Body() dto: CreateContractDto) { ... }

  // With resource ID from route param
  @Delete(':id')
  @Audit('CONTRACT_DELETED', { resourceIdParam: 'id' })
  async delete(@Param('id') id: string) { ... }

  // With sanitized body in audit metadata
  @Patch(':id')
  @Audit('CONTRACT_UPDATED', { resourceIdParam: 'id', includeBody: true })
  async update(@Param('id') id: string, @Body() dto: UpdateContractDto) { ... }

  // Override auto-derived resourceType
  @Post(':id/export')
  @Audit('REPORT_EXPORTED', { resourceIdParam: 'id', resourceType: 'reports' })
  async export(@Param('id') id: string) { ... }
}
```

### Decorator Options

| Option            | Type      | Default                                   | Description                                      |
| ----------------- | --------- | ----------------------------------------- | ------------------------------------------------ |
| `resourceType`    | `string`  | Auto-derived from `@Controller()` path    | Override the resource type in audit log          |
| `resourceIdParam` | `string`  | `undefined` (falls back to response body) | Route param name containing the resource ID      |
| `includeBody`     | `boolean` | `false`                                   | Include sanitized request body in `details.body` |

### Event Naming Convention

```
{RESOURCE}_{ACTION}

Examples:
  AUTH_LOGIN
  AUTH_SIGNUP
  AUTH_PASSWORD_RESET
  DOCUMENT_CREATED
  DOCUMENT_DELETED
  TENANT_SETTINGS_UPDATED
  INVITATION_RESEND
  SUBSCRIPTION_PLAN_CHANGED
  FILE_UPLOADED
```

### What Gets Logged

Every audit record contains:

| Field            | Source                                                 |
| ---------------- | ------------------------------------------------------ |
| `tenant_id`      | JWT tenant context                                     |
| `actor_id`       | JWT `userId`                                           |
| `actor_type`     | `'user'` (always for HTTP)                             |
| `user_role`      | JWT `role`                                             |
| `action`         | Event name from `@Audit()`                             |
| `resource_type`  | Explicit option or auto-derived from controller path   |
| `resource_id`    | Route param (if configured) or response body `id`      |
| `ip_address`     | `request.ip` (see Client IP above); dropped if not an IP |
| `user_agent`     | Request `User-Agent` header, first 512 characters      |
| `trace_id`       | From CLS (same as system log trace ID)                 |
| `details.method` | HTTP method                                            |
| `details.url`    | Request URL                                            |
| `details.body`   | Sanitized request body (only when `includeBody: true`) |

`AuditService` fits every value to its column before the insert, so no input can make the row fail
to write; a failed write is logged at `error` level.

### When to Use Audit vs System Logging

| Scenario                                | Use                                  |
| --------------------------------------- | ------------------------------------ |
| User creates/updates/deletes a resource | `@Audit()`                           |
| User logs in, changes password          | `@Audit()`                           |
| Admin changes tenant settings           | `@Audit()`                           |
| Database query timing for monitoring    | System log (`Logger`)                |
| Error debugging with stack trace        | System log (`Logger`)                |
| Cache hit/miss for performance tuning   | System log (`Logger`)                |
| Permission denied (security monitoring) | System log (`Logger.warn()`)         |
| Job processing lifecycle                | System log (via `AbstractProcessor`) |

### System Logging Coverage

The following components have structured logging for security, debugging, and operational visibility:

| Component                              | Logs                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| **PlatformRbacService**                | Permission checks (debug), role lookups (debug), failures (warn)        |
| **TenantRbacService**                  | Permission checks (debug), role lookups (debug), failures (warn)        |
| **DocumentsService**                   | Document create (log), job enqueue (log), errors (error)                |
| **DocumentGenerationService**          | Generation start/complete with template key (log), errors (error)       |
| **CreditBalanceService**               | Balance queries (debug), insufficient balance (warn), breakdown (debug) |
| **TenantPermissionsGuard**             | Access denial with userId, role, required permission (warn)             |
| **PlatformPermissionsGuard**           | Access denial with userId, role, required permission (warn)             |
| **JWT strategies**                     | Invalid token type, expired token, validation failures (warn)           |
| **JwtAuthGuard / JwtAuthRefreshGuard** | Passport validation errors (expired, malformed) (warn)                  |
| **AuthService**                        | Login failures: user not found, invalid password (warn)                 |
| **BaseRepository**                     | Query failures with table, operation type (error)                       |
| **AuditLogsRepository**                | Batch insert failures, row insert failures (error)                      |
| **HealthService**                      | Database/Redis/queue health check failures (error/warn)                 |

### Manual AuditService Usage

For audit logging outside the HTTP request cycle (e.g., system events, batch operations):

```typescript
import { AuditService } from '@lib/audit';

@Injectable()
export class MyService {
  constructor(private readonly auditService: AuditService) {}

  async systemMaintenance(): Promise<void> {
    await this.auditService.logSystemEvent({
      action: 'SYSTEM_MAINTENANCE',
      resourceType: 'system',
      details: { task: 'cleanup_expired_tokens' },
    });
  }
}
```

### Body Sanitization

When `includeBody: true`, the request body is sanitized before storage:

- **Sensitive keys** (`password`, `token`, `secret`, `authorization`, `api_key`, etc.) → `[REDACTED]`
- **Long strings** (>500 chars) → truncated with `...[TRUNCATED]`
- **Deep nesting** (>5 levels) → `[MAX_DEPTH_EXCEEDED]`

The sanitizer is at `apps/api/src/common/utils/audit-sanitize.util.ts`.

---

## Distributed Tracing

### How Trace IDs Work

Every request gets a unique trace ID that follows it across the gateway and into workers:

```
Client Request
     │
     ▼
Gateway (Fastify generates req.id)
     │
     ├── TracingMiddleware: stores req.id in CLS as CLS_TRACE_ID
     ├── TracingInterceptor: assigns trace_id to Pino logger
     ├── AuditInterceptor: AuditService reads CLS_TRACE_ID for audit_logs.trace_id
     │
     ├── QueueProducerService.enqueue():
     │   reads CLS_TRACE_ID + CLS_TENANT_ID → job._metadata
     │
     ▼
Worker (BullMQ picks up job)
     │
     ├── AbstractProcessor.process():
     │   reads job._metadata → runs the job inside a CLS context (trace and tenant set, so
     │   jobs it queues and audit rows it writes keep them) and nestjs-pino's storage with a
     │   child logger bound to trace_id, tenant_id, queue_name, job_id, job_name
     │
     ▼
All worker logs for this job include the original trace_id
```

### Accessing Trace ID in Code

```typescript
import { CLS_TRACE_ID } from '@lib/context';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class MyService {
  constructor(private readonly cls: ClsService) {}

  getTraceId(): string | undefined {
    return this.cls.get<string>(CLS_TRACE_ID);
  }
}
```

### Key Files

| Component         | Path                                       |
| ----------------- | ------------------------------------------ |
| Constants         | `libs/context/src/context.constants.ts`    |
| CLS seeding       | `libs/context/src/tracing.middleware.ts`   |
| Pino assignment   | `libs/context/src/tracing.interceptor.ts`  |
| Queue propagation | `libs/queue/src/queue-producer.service.ts` |
| Worker extraction | `libs/queue/src/abstract-processor.ts`     |

### Debugging with Trace IDs

To follow a request across gateway and workers:

1. Find the `trace_id` in the gateway log for the request
2. Search worker logs for the same `trace_id`
3. Query `audit_logs` table: `SELECT * FROM audit_logs WHERE trace_id = '...'`

All three should share the same trace ID for a single user action.

---

## PII & Security

### What Constitutes PII

In the context of logging, these are considered PII and must not appear in system logs:

- Email addresses, full names, phone numbers
- Passwords, tokens, API keys, secrets
- IP addresses (allowed in audit logs for compliance, redacted from system logs)
- Document content, contract text
- Financial data (credit card numbers, bank accounts)

### Redaction in System Logs (Pino)

Three layers, all in `libs/logger`:

- **Every log call** goes through pino's `hooks.logMethod`, which runs `scrubLogValue` (`logger.scrub.ts`) on its arguments. That includes Nest `Logger` messages, which are plain strings pino's redaction can't see: JWTs, `Bearer …` values and `token=`/`code=`/`state=`/`secret=`/`password=`/`key=` query values become `[REDACTED]`, email addresses are masked to `a***@corp.ae`, keys named like secrets (`password`, `token`, `authorization`, `cookie`, …) are replaced, and errors are copied with a scrubbed message and stack.
- **Requests** are logged by the `req` serializer, which never emits headers or bodies; its `url` and `query` are scrubbed the same way (invitation tokens, OAuth `code`/`state`).
- **fast-redact** paths (`PINO_REDACT_PATHS`): the sensitive keys at the top of a log object and one level down.

An opaque random token can't be recognised in text, so none may be interpolated into a log call: `libs/logger/src/no-secrets-in-logs.spec.ts` fails on a log template interpolating a variable named like a token, secret or password.

### Redaction in Audit Logs

The audit body sanitizer (`audit-sanitize.util.ts`) uses a case-insensitive denylist:

`password`, `token`, `secret`, `authorization`, `creditcard`, `credit_card`, `ssn`, `social_security`, `api_key`, `apikey`, `private_key`, `privatekey`, `access_token`, `accesstoken`, `refresh_token`, `refreshtoken`, `session`, `cookie`

### Adding New Redaction Paths

**For system logs (Pino):**

1. A key: add it to `SENSITIVE_KEYS` and `REDACT_KEYS` in `libs/logger/src/logger.redaction.ts`
2. A pattern in text: add it to `scrubLogText` in `libs/logger/src/logger.scrub.ts`, with a test

**For audit logs:**

1. Add the key (lowercase) to `SENSITIVE_KEYS` in `apps/api/src/common/utils/audit-sanitize.util.ts`

### Review Checklist for New Log Statements

Before merging any PR that adds logging:

- [ ] No passwords, tokens, or secrets in log messages
- [ ] No email addresses or full names in system logs (use user IDs instead)
- [ ] No raw SQL query parameters logged
- [ ] No request/response bodies logged at `info` level (use `debug` only)
- [ ] Sensitive fields covered by existing redaction paths or new paths added
- [ ] Error logs include stack traces via second argument: `logger.error(message, error.stack)`
- [ ] Log level is appropriate (see level guidelines above)

---

## Local Development

### Viewing Logs

In development (`NODE_ENV=development`), Pino uses `pino-pretty`:

```
[2026-03-14 02:30:00] INFO (gateway): Request completed
    trace_id: "req-1"
    method: "POST"
    url: "/contracts"
    statusCode: 201
    responseTime: 45
```

### Environment Variables

Create or update your `.env` files:

```bash
# apps/api/.env
LOG_LEVEL=debug          # trace | debug | info | warn | error | fatal | silent
NODE_ENV=development     # enables pino-pretty

# apps/worker-ai/.env
LOG_LEVEL=debug
NODE_ENV=development

# apps/worker-ingestion/.env
LOG_LEVEL=debug
NODE_ENV=development
```

### Testing Audit Logs Locally

1. Start the API: `pnpm dev`
2. Make a request to an `@Audit()`-decorated endpoint
3. Query the database:

```sql
SELECT action, resource_type, resource_id, actor_id, trace_id, details, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 10;
```

4. Verify the `trace_id` in the audit log matches the one in the Pino stdout output

### Viewing Worker Job Logs

1. Start all apps: `pnpm dev:all`
2. Trigger a job (e.g., document analysis)
3. Worker logs appear in the worker's stdout with `job_id`, `job_name`, `queue_name`, and `trace_id`

---

**Last Updated:** 2026-03-17
**Status:** PRE-PRODUCTION
