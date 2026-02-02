# Data Ingestion Worker Documentation

> **Status:** Coming Soon

This directory will contain documentation for the data ingestion worker application.

## Overview

The Data Ingestion Worker is responsible for:

- Processing uploaded documents
- Extracting metadata and content
- Data validation and transformation
- Background job processing
- Queue management

## Documentation (Coming Soon)

| Document       | Description                    |
| -------------- | ------------------------------ |
| DEVELOPMENT.md | Development workflow and setup |
| API.md         | Internal API documentation     |
| DEPLOYMENT.md  | Deployment instructions        |

## Quick Start

```bash
# Start ingestion worker (from project root)
pnpm start:worker-ingestion

# Start in development mode with hot-reload
pnpm start:worker-ingestion --watch

# Build for production
pnpm build:worker-ingestion

# Run production build
pnpm start:worker-ingestion:prod
```

## Environment Variables

Create a `.env` file in `apps/worker-ingestion/`:

```bash
# Copy from example
cp apps/worker-ingestion/.env.example apps/worker-ingestion/.env
```

See `.env.example` for required configuration.

## Related Documentation

- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation
- [Main README](../../../README.md) - Project overview
- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture
- [Database Schema](../../../docs/DATABASE.md) - Database design

---

**Last Updated:** February 2, 2026
