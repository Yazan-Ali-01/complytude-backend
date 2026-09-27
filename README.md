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
| **Scale** | ~70,900 lines of TypeScript across 569 files (`apps/` + `libs/`) |
| **Services** | 4 deployable apps (API + 3 queue workers), 10 shared libraries |
| **Domain modules** | 21 |
| **Database** | 22 SQL migrations, row-level security, no ORM |
| **Infrastructure** | 15 Terraform modules; staging deployed, production scaffolded only |
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

The API is a domain-driven modular monolith. Long-running work — text extraction and
embedding, compliance analysis, DOCX → PDF document generation — is dispatched over BullMQ
to three separate worker processes that deploy independently. Each domain can be lifted
into its own service without rewriting call sites, because everything already crosses a
queue boundary.

→ [`libs/queue`](libs/queue) · [`apps/worker-ai`](apps/worker-ai) · [`apps/worker-ingestion`](apps/worker-ingestion) · [`apps/worker-generation`](apps/worker-generation)

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
| `stripe` | Checkout, customers, subscriptions, add-ons, billing portal, tax, catalog sync, webhooks |
| `billing` | Webhook processing, Stripe reconciliation, dunning emails |
| `entitlements` | Quota and feature-gate resolution |
| `tenant-processing` | Async tenant lifecycle side effects (Stripe customer creation) over a queue |
| `documents` | Upload, text extraction, analysis and generation jobs |
| `templates` | Legal template CRUD and versioning |
| `categories` | Template and document taxonomy |
| `authorities` | UAE authority definitions (DMCC, IFZA, DED, RAKEZ) |
| `rulesets` | Compliance rules per authority |
| `rag-mock` | Retrieval-augmented compliance analysis (mock provider; dev only, `ENABLE_MOCK_ROUTES`) |
| `storage` | Tenant-isolated S3 upload/download with presigned URLs |
| `email` | Transactional email via AWS SES |
| `health` | Liveness and dependency health checks |
| `mock` | Deterministic providers for local development (dev only, `ENABLE_MOCK_ROUTES`) |

**Shared libraries** (`libs/`): `audit` (audit trail) · `context` (request/trace context) ·
`database` · `docx-renderer` · `embedding` · `logger` · `pdf` (Gotenberg conversion) · `queue` ·
`redis` · `storage`

---

## Infrastructure

Fully declared in Terraform under [`infra/`](infra) — no console-clicked resources.

**Modules:** `networking` (VPC, subnets, NAT) · `ecs` (Fargate services) · `rds`
(PostgreSQL) · `elasticache` (Redis) · `alb` · `acm` · `route53` · `route53-record` ·
`s3` · `ecr` · `bastion` · `secrets` (Secrets Manager) · `ses` (transactional email) ·
`developers` (IAM access for engineers) · `monitoring` (CloudWatch alarms, SNS)

**Environments:** [`infra/environments/staging`](infra/environments/staging) (deployed) ·
[`infra/environments/production`](infra/environments/production) (provider scaffold only; never built out)

**Pipeline** ([`.github/workflows/deploy-staging.yml`](.github/workflows/deploy-staging.yml)):
lint and type-check → run migrations through a bastion-tunnelled job with
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

**What's covered:** 9 integration suites (62 tests) — session lifecycle, session security and
session endpoints (the dual-token flow), the entitlement projection pipeline plus a latency
benchmark, the audit repository, document upload confirmation, the test factories, and the
harness smoke test — alongside 20 unit spec files (279 tests).

**What's missing, stated plainly:** tenant isolation is barely tested. The API under test
connects as a Postgres superuser, which bypasses row-level security. RLS is exercised only
where a test switches role through the `withTenantContext` helper, and just one test checks
that one tenant cannot read another's rows. Billing, Stripe webhooks and the document
pipeline have no tests. The suites also drifted after development stopped:
`apps/api/.env.test` lacks two Stripe variables the config now requires, and 4 unit and 4
integration tests fail on stale expectations. CI runs lint and type-check but does not run
tests, which is why none of this was caught.

This is the repository's most significant gap and it is not hidden here.

---

## Running locally

Requires Node 22+, pnpm 9+, Docker 24+.

```bash
git clone https://github.com/Yazan-Ali-01/complytude-backend.git
cd complytude-backend
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm project:setup    # starts Postgres and Redis; runs migrations
pnpm dev              # API with hot reload
```

- API — `http://localhost:3000/api/v1`
- Swagger — `http://localhost:3000/docs`
- Health — `http://localhost:3000/api/health`

Apps run locally against containerised infrastructure by default (`pnpm services:up`,
`services:down`, `services:reset`). Fully containerised overlays live in
`docker-compose.dev.yml` and `docker-compose.prod.yml`.

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
TypeScript with `any` down to 10 occurrences in application code · ESLint and Prettier ·
URI-based API versioning · i18n with per-module message constants · all work merged
through pull requests.

---

## License

MIT — see [`LICENSE`](LICENSE).

**Author:** Yazan Ali
