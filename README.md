# Complytude — Backend

Multi-tenant SaaS backend for UAE legal document generation and compliance analysis.
NestJS 11 · Fastify 5 · PostgreSQL 16 · BullMQ · Terraform/AWS ECS

> **Status:** Development on this product stopped in 2026. The repository is public as a
> reference implementation — the architecture, infrastructure, and multi-tenant isolation
> model are the parts worth reading. Known gaps are listed honestly under
> [Testing](#testing).

---

## What this is

A production-shaped B2B SaaS backend, built from scratch and taken to a deployed staging
environment on AWS. I architected it and led the engineering team that built it.

| | |
|---|---|
| **Scale** | ~45,600 lines of TypeScript across 388 files |
| **Services** | 3 deployable apps (API + 2 queue workers), 4 shared libraries |
| **Domain modules** | 18 |
| **Database** | 28 SQL migrations, row-level security, no ORM |
| **Infrastructure** | 13 Terraform modules, staging + production environments |
| **Pipeline** | GitHub Actions → ECR → ECS, with automated migrations |

---

## Architecture decisions worth reading

Each links to the actual implementation rather than describing it.

### Tenant isolation enforced at the database, not the application

Multi-tenant data separation is implemented with PostgreSQL **row-level security** rather
than `WHERE tenant_id = ?` scattered across a service layer. A missed filter in application
code cannot leak data across tenants, because the database will not return the rows.

→ [`docs/DATABASE.md`](docs/DATABASE.md) · [`libs/database`](libs/database) · [`scripts/migrations`](scripts)

### Dual-token authentication separating identity from tenant context

A user may belong to several organisations. Rather than reissuing a single token on every
context switch, authentication splits into an **identity token** (who you are) and a
**tenant token** (which organisation you are acting within, and with what role). Tenant
context is resolved by a guard and injected via decorator, so no controller handles it
manually.

→ [`apps/api/src/modules/auth`](apps/api/src/modules/auth) · [`docs/RBAC.md`](docs/RBAC.md)

### Two-layer authorization: platform RBAC and tenant RBAC

Permissions split into platform-level roles (staff, support, admin) and tenant-level roles
(admin, member, viewer), kept in separate modules so that internal tooling access and
customer-facing access never share a permission surface.

→ [`apps/api/src/modules/platform-rbac`](apps/api/src/modules/platform-rbac) · [`apps/api/src/modules/tenant-rbac`](apps/api/src/modules/tenant-rbac)

### Entitlements as a single source of truth

Subscription limits (document quotas, feature gates, seat counts) are resolved through a
dedicated entitlements module rather than reading a plan column at each call site — a
deliberate refactor after plan checks began drifting between modules.

→ [`apps/api/src/modules/entitlements`](apps/api/src/modules/entitlements) · [`docs/ENTITLEMENTS.md`](docs/ENTITLEMENTS.md)

### Event-driven monolith, structured for extraction

The API is a domain-driven modular monolith. Long-running work — document analysis,
embedding generation, ingestion — is dispatched over BullMQ to separate worker processes
that deploy independently. Each domain can be lifted into its own service without
rewriting call sites, because everything already crosses a queue boundary.

→ [`libs/queue`](libs/queue) · [`apps/worker-ai`](apps/worker-ai) · [`apps/worker-ingestion`](apps/worker-ingestion)

### A repository layer over raw SQL, no ORM

Data access goes through explicit repositories issuing parameterised SQL. This keeps RLS
session variables, connection pooling, and transaction boundaries visible instead of
hidden behind an abstraction — and keeps generated query plans predictable.

→ [`apps/api/src/repositories`](apps/api/src/repositories) · [`libs/database`](libs/database)

---

## Modules

| Module | Responsibility |
|---|---|
| `auth` | Dual-token JWT, signup, verification, password reset |
| `users` | User records, multi-tenant membership |
| `tenants` | Organisation lifecycle |
| `tenant-rbac` | Tenant-scoped roles and permissions |
| `platform-rbac` | Platform staff roles, internal access control |
| `invitations` | Token-based invite, accept, reject flows |
| `subscriptions` | Plan assignment and billing state |
| `entitlements` | Quota and feature-gate resolution |
| `documents` | Document lifecycle and analysis jobs |
| `templates` | Legal template CRUD and versioning |
| `categories` | Template and document taxonomy |
| `authorities` | UAE authority definitions (DMCC, IFZA, DED, RAKEZ) |
| `rulesets` | Compliance rules per authority |
| `rag-mock` | Retrieval-augmented compliance analysis (mock provider) |
| `storage` | Tenant-isolated S3 upload/download with presigned URLs |
| `audit` | Audit trail for privileged actions |
| `health` | Liveness and dependency health checks |
| `mock` | Deterministic providers for local development |

---

## Infrastructure

Fully declared in Terraform under [`infra/`](infra) — no console-clicked resources.

**Modules:** `networking` (VPC, subnets, NAT) · `ecs` (Fargate services) · `rds`
(PostgreSQL) · `elasticache` (Redis) · `alb` · `acm` · `route53` · `route53-record` ·
`s3` · `ecr` · `bastion` · `secrets` (Secrets Manager) · `monitoring` (CloudWatch alarms,
SNS)

**Environments:** [`infra/environments/staging`](infra/environments/staging) ·
[`infra/environments/production`](infra/environments/production)

**Pipeline** ([`.github/workflows/deploy-staging.yml`](.github/workflows/deploy-staging.yml)):
lint and type-check → run migrations and seeds through a bastion-tunnelled job with
dynamically scoped security-group rules → build and push to ECR → deploy to ECS.

→ [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Testing

**What exists:** a full integration harness built on
[Testcontainers](https://testcontainers.com/) — real PostgreSQL and Redis spun up per run,
migrations applied against them, a Nest application factory for booting the API under test,
and per-worker Redis database isolation so suites run in parallel without cross-talk.

→ [`apps/api/test/setup`](apps/api/test/setup) · [`jest.config.ts`](jest.config.ts)

```bash
pnpm test              # all projects
pnpm test:unit         # unit only
pnpm test:integration  # integration (requires Docker)
pnpm test:coverage
```

**What's missing, stated plainly:** the harness landed shortly before development stopped,
so coverage is currently a single smoke test verifying the infrastructure itself. The
suites it was built for — RLS isolation, the dual-token flow, entitlement enforcement, queue
round-trips — were never written. CI runs lint and type-check but does not yet run tests.

This is the repository's most significant gap and it is not hidden here.

---

## Running locally

Requires Node 22+, pnpm 9+, Docker 24+.

```bash
git clone https://github.com/Yazan-Ali-01/complytude-backend.git
cd complytude-backend
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm project:setup    # starts Postgres, Redis, MinIO; runs migrations
pnpm dev              # API with hot reload
```

- API — `http://localhost:3000/api`
- Swagger — `http://localhost:3000/docs`
- Health — `http://localhost:3000/api/health`

Apps run locally against containerised infrastructure by default. Fully containerised
development and production-parity modes are available via `pnpm docker:dev` and
`pnpm docker:prod`.

→ [`apps/api/docs/DEVELOPMENT.md`](apps/api/docs/DEVELOPMENT.md) for environment variables,
the full script reference, and module scaffolding conventions.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design and module boundaries |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema, RLS policies, migration strategy |
| [`docs/RBAC.md`](docs/RBAC.md) | Platform and tenant permission models |
| [`docs/ENTITLEMENTS.md`](docs/ENTITLEMENTS.md) | Plan limits and feature gating |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker and AWS deployment |
| [`apps/api/docs/API_CONTRACTS.md`](apps/api/docs/API_CONTRACTS.md) | Response envelopes, error shapes, versioning |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commit conventions, hooks, PR process |

Schema diagram source: [`docs/database-schema.dbml`](docs/database-schema.dbml)

---

## Engineering conventions

Conventional commits enforced by commitlint · pre-commit hooks via Husky · strict
TypeScript with `any` eliminated from application code · ESLint and Prettier ·
URI-based API versioning · i18n with per-module message constants · all work merged
through pull requests.

---

## License

MIT — see [`LICENSE`](LICENSE).

**Author:** Yazan Ali
