# Complytude Documentation

Welcome to the Complytude documentation hub. This index provides links to all project documentation.

## Monorepo Structure

Complytude uses a **NestJS monorepo** with pnpm workspaces:

```
backend/
├── apps/
│   ├── api/                 # Main API (NestJS + Fastify)
│   ├── worker-ingestion/    # File processing worker
│   └── worker-ai/           # LLM orchestration worker
├── libs/
│   └── shared/              # Shared code (@complytude/shared)
└── docs/                    # This documentation
```

## Documentation Index

| Document                              | Description                                           |
| ------------------------------------- | ----------------------------------------------------- |
| [README.md](../README.md)             | Project overview, features, quick start guide         |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines, git hooks, commit standards  |
| [SCRIPTS.md](SCRIPTS.md)              | Complete script reference and usage guide             |
| [DEVELOPMENT.md](DEVELOPMENT.md)      | Development workflow, monorepo commands, best practices |
| [DEPLOYMENT.md](DEPLOYMENT.md)        | Deployment instructions, production setup             |
| [ARCHITECTURE.md](ARCHITECTURE.md)    | System architecture, monorepo layout, design patterns |
| [DATABASE.md](DATABASE.md)            | Database schema, RLS, and data model                  |
| [API_CONTRACTS.md](API_CONTRACTS.md)  | API contract standards, DTOs, Swagger documentation   |
| [API_CONTRACTS_QUICK_REFERENCE.md](API_CONTRACTS_QUICK_REFERENCE.md) | Quick reference for API patterns and examples |

## Additional Documentation

| Document                                  | Description                          |
| ----------------------------------------- | ------------------------------------ |
| [test/README.md](../test/README.md)       | E2E testing guide, test utilities    |
| [scripts/README.md](../scripts/README.md) | Database migrations, utility scripts |

## Quick Links

### Getting Started

1. **New to the project?** Start with the [main README](../README.md) for an overview and quick start guide.

2. **Want to contribute?** Read [CONTRIBUTING.md](../CONTRIBUTING.md) for our development workflow and commit standards.

3. **Setting up development?** Check out [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development guidelines.

### For Developers

- **New to the monorepo?** See [DEVELOPMENT.md](DEVELOPMENT.md) for monorepo commands and workflow.
- **Building APIs?** See [API_CONTRACTS.md](API_CONTRACTS.md) for contract standards and [Quick Reference](API_CONTRACTS_QUICK_REFERENCE.md) for templates.
- **Using shared code?** Import from `@complytude/shared` - see [DEVELOPMENT.md](DEVELOPMENT.md#using-shared-library).
- **Running tests?** See [test/README.md](../test/README.md) for testing documentation.
- **Working with the database?** See [scripts/README.md](../scripts/README.md) for migration guides.
- **Deploying?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions.

### Reference

- **API Documentation**: Available at `http://localhost:3000/docs` when running the server
- **Postman Collection**: `Complytude_API.postman_collection.json` in the project root

---

## Documentation Standards

When updating documentation:

- Keep docs focused on their specific topic
- Use clear headings and table of contents for longer docs
- Include code examples where helpful
- Update cross-references when moving content
- Test links in both GitHub web view and local preview

---

[Back to main README](../README.md)
