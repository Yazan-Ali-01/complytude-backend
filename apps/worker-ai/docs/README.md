# AI Worker Documentation

> **Status:** Coming Soon

This directory will contain documentation for the AI processing worker application.

## Overview

The AI Worker is responsible for:

- AI-powered contract analysis
- Document processing and extraction
- Compliance checking with AI assistance
- Natural language processing tasks

## Documentation (Coming Soon)

| Document       | Description                    |
| -------------- | ------------------------------ |
| DEVELOPMENT.md | Development workflow and setup |
| API.md         | Internal API documentation     |
| DEPLOYMENT.md  | Deployment instructions        |

## Quick Start

```bash
# Start AI worker (from project root)
pnpm start:worker-ai

# Start in development mode with hot-reload
pnpm start:worker-ai --watch

# Build for production
pnpm build:worker-ai

# Run production build
pnpm start:worker-ai:prod
```

## Environment Variables

Create a `.env` file in `apps/worker-ai/`:

```bash
# Copy from example
cp apps/worker-ai/.env.example apps/worker-ai/.env
```

See `.env.example` for required configuration.

## Related Documentation

- [Monorepo Documentation](../../../docs/README.md) - System-wide documentation
- [Main README](../../../README.md) - Project overview
- [Architecture](../../../docs/ARCHITECTURE.md) - System architecture

---

**Last Updated:** February 2, 2026
