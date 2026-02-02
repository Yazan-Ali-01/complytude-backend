# Complytude Documentation

Welcome to the Complytude documentation hub. This directory contains documentation that applies to the **entire monorepo** (all applications).

## Monorepo Structure

Complytude is organized as a monorepo with multiple applications:

```
complytude/
├── apps/
│   ├── api/                 # Main API application
│   ├── worker-ai/           # AI processing worker
│   └── worker-ingestion/    # Data ingestion worker
├── libs/
│   └── shared/              # Shared libraries and utilities
├── docs/                    # This directory (monorepo-wide docs)
└── scripts/                 # Database migrations and utilities
```

---

## Monorepo-Wide Documentation

This directory contains documentation that applies across all applications:

| Document                                     | Description                             |
| -------------------------------------------- | --------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)           | System architecture and design patterns |
| [DATABASE.md](DATABASE.md)                   | Database schema, RLS, and data model    |
| [database-schema.dbml](database-schema.dbml) | Visual database schema (DBML format)    |
| [DEPLOYMENT.md](DEPLOYMENT.md)               | Deployment instructions for all apps    |

---

## App-Specific Documentation

Each application has its own documentation:

### API Application

**Location:** `apps/api/docs/`

| Document                                                                 | Description                                  |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| [API Documentation Hub](../apps/api/docs/README.md)                      | API-specific documentation index             |
| [API Contracts](../apps/api/docs/API_CONTRACTS.md)                       | API contract standards, authentication, DTOs |
| [API Quick Reference](../apps/api/docs/API_CONTRACTS_QUICK_REFERENCE.md) | Quick reference for API patterns             |
| [Development Guide](../apps/api/docs/DEVELOPMENT.md)                     | Development workflow, module creation        |
| [Testing Guide](../apps/api/test/README.md)                              | E2E testing guide, test utilities            |

### Worker Applications

**AI Worker:** `apps/worker-ai/docs/` (coming soon)  
**Ingestion Worker:** `apps/worker-ingestion/docs/` (coming soon)

---

## Additional Documentation

| Document                                            | Description                          |
| --------------------------------------------------- | ------------------------------------ |
| [scripts/README.md](../scripts/README.md)           | Database migrations, utility scripts |
| [scripts/QUICK_START.md](../scripts/QUICK_START.md) | Quick start guide for database setup |

---

## Project Root Documentation

| Document                              | Description                                          |
| ------------------------------------- | ---------------------------------------------------- |
| [README.md](../README.md)             | Project overview, features, quick start guide        |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines, git hooks, commit standards |

---

## Quick Links

### Getting Started

1. **New to the project?** Start with the [main README](../README.md) for an overview and quick start guide.

2. **Want to contribute?** Read [CONTRIBUTING.md](../CONTRIBUTING.md) for our development workflow and commit standards.

3. **Setting up development?** Check out the [API Development Guide](../apps/api/docs/DEVELOPMENT.md) for detailed development guidelines.

### For Developers

- **Building APIs?** See [API Contracts](../apps/api/docs/API_CONTRACTS.md) for contract standards and [Quick Reference](../apps/api/docs/API_CONTRACTS_QUICK_REFERENCE.md) for templates.
- **Running tests?** See [Testing Guide](../apps/api/test/README.md) for testing documentation.
- **Working with the database?** See [Database Schema](DATABASE.md) and [Scripts Guide](../scripts/README.md) for migration guides.
- **Deploying?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions.
- **Understanding the architecture?** See [ARCHITECTURE.md](ARCHITECTURE.md) for system design.

### Reference

- **API Documentation**: Available at `http://localhost:3000/docs` when running the API server
- **Postman Collection**: `Complytude_API.postman_collection.json` in the project root

---

## Documentation Standards

When updating documentation:

- **Monorepo-wide docs** go in `docs/` (architecture, database, deployment)
- **App-specific docs** go in `apps/{app-name}/docs/` (API contracts, development guides)
- **Feature-specific docs** go in the module directory (e.g., `apps/api/src/modules/documents/REQUIREMENTS.md`)
- Keep docs focused on their specific topic
- Use clear headings and table of contents for longer docs
- Include code examples where helpful
- Update cross-references when moving content
- Test links in both GitHub web view and local preview

---

## Documentation Organization

### What Goes Where?

**Root `docs/` (Monorepo-Wide):**

- ✅ System architecture
- ✅ Shared database schema
- ✅ Deployment strategies for all apps
- ✅ Multi-tenancy design
- ✅ Authentication strategy (system-wide)

**App-Specific `apps/{app}/docs/`:**

- ✅ API contracts and endpoints
- ✅ App-specific development guides
- ✅ Module creation patterns
- ✅ Testing strategies for that app
- ✅ App-specific configuration

**Feature-Specific (in module):**

- ✅ Module requirements
- ✅ Feature implementation notes
- ✅ Complex business logic documentation

---

[Back to main README](../README.md)
