# Complytude API Documentation

Welcome to the Complytude API documentation. This directory contains all documentation specific to the main API application.

## Documentation Index

| Document                                                             | Description                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| [API_CONTRACTS.md](API_CONTRACTS.md)                                 | API contract standards, authentication, DTOs          |
| [API_CONTRACTS_QUICK_REFERENCE.md](API_CONTRACTS_QUICK_REFERENCE.md) | Quick reference for API patterns and examples         |
| [DEVELOPMENT.md](DEVELOPMENT.md)                                     | Development workflow, module creation, best practices |

## Quick Links

### For API Developers

- **Building APIs?** See [API_CONTRACTS.md](API_CONTRACTS.md) for contract standards and [API_CONTRACTS_QUICK_REFERENCE.md](API_CONTRACTS_QUICK_REFERENCE.md) for templates.
- **Creating modules?** Check [DEVELOPMENT.md](DEVELOPMENT.md) for module creation patterns.
- **Handling errors with i18n?** See [I18N_GUIDE.md](I18N_GUIDE.md) for translations and localization.
- **API Documentation**: Available at `http://localhost:3000/docs` when running the server

### Monorepo-Wide Documentation

For documentation that applies to the entire monorepo (all apps):

- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture and design patterns
- [Database](../../../docs/DATABASE.md) - Database schema, RLS, and data model
- [Deployment](../../../docs/DEPLOYMENT.md) - Deployment instructions for all apps
- [Scripts](../../../scripts/README.md) - Database migrations and utility scripts

### Project Root

- [Main README](../../../README.md) - Project overview and quick start
- [CONTRIBUTING](../../../CONTRIBUTING.md) - Contribution guidelines

---

## API Structure

The API application follows NestJS modular architecture:

```
apps/api/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/            # Authentication & authorization
│   │   ├── users/           # User management
│   │   ├── tenants/         # Multi-tenancy management
│   │   ├── invitations/     # Tenant invitations
│   │   ├── templates/       # Template CRUD & versioning
│   │   ├── documents/       # Document generation
│   │   ├── storage/         # File storage (S3/MinIO)
│   │   ├── authorities/     # Regulatory authorities
│   │   ├── categories/      # Template categories
│   │   ├── rulesets/        # Compliance rulesets
│   │   └── health/          # Health checks
│   ├── common/              # Cross-cutting concerns
│   ├── config/              # Configuration
│   ├── database/            # Database service
│   ├── repositories/        # Data access layer
│   └── i18n/                # Internationalization
└── docs/                    # This directory
```

---

## Development Workflow

### Daily Development

```bash
# Start API with hot-reload (from project root)
pnpm start:api

# Or use the smart dev command that auto-starts services
pnpm dev
```

### Code Quality

```bash
# Lint and auto-fix
pnpm lint

# Format code
pnpm format

# Type check
pnpm type-check
```

---

## API Endpoints

### Available at:

- 🚀 API: http://localhost:3000/api
- 📚 Swagger Docs: http://localhost:3000/docs
- 🏥 Health Check: http://localhost:3000/api/health

### Key Endpoint Groups

| Category       | Endpoints                                                   |
| -------------- | ----------------------------------------------------------- |
| Auth           | `POST /api/auth/signup`, `/login`, `/refresh`, `/logout`    |
| Invitations    | `POST /api/auth/invitations/:id/accept`, `/reject`          |
| Tenant Invites | `POST /api/tenants/admin/invitations`, `GET`, `DELETE /:id` |
| Users          | `GET /api/users/me`, `PATCH /api/users/me`                  |
| Tenants        | `POST /api/tenants`, `GET /api/tenants/:id`                 |
| Storage        | `POST /api/storage/upload`, `GET /api/storage/list`         |
| Templates      | `GET /api/templates`, `POST /api/templates`                 |
| Health         | `GET /api/health`, `/health/db`, `/health/storage`          |

---

## Module Status

| Module          | Description                                       | Status      |
| --------------- | ------------------------------------------------- | ----------- |
| **auth**        | JWT authentication, signup, login, password reset | ✅ Complete |
| **users**       | User management, roles, multi-tenant membership   | ✅ Complete |
| **tenants**     | Organization management, subscription plans       | ✅ Complete |
| **invitations** | Tenant invitations, accept/reject flows           | ✅ Complete |
| **storage**     | File upload/download via S3/MinIO with isolation  | ✅ Complete |
| **templates**   | Legal document template CRUD & versioning         | 🟡 Partial  |
| **documents**   | Document generation from templates                | 🟡 Partial  |
| **authorities** | Regulatory authorities management                 | ✅ Complete |
| **categories**  | Template categories management                    | ✅ Complete |
| **rulesets**    | Compliance rulesets with versioning               | ✅ Complete |
| **health**      | Health checks for database, storage (MinIO/S3)    | ✅ Complete |

---

[Back to Main Documentation](../../../docs/README.md)
