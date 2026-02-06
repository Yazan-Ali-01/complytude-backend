# Docker Scripts

This directory contains initialization scripts for Docker services.

## Files

### `postgres-init.sh`

**Purpose:** Initializes PostgreSQL with the pgvector extension on first container startup.

**What it does:**
- Enables the `pgvector` extension in the main database
- Verifies the extension is installed correctly
- Runs automatically when the PostgreSQL container is created for the first time

**Usage:**
This script is automatically executed by PostgreSQL's `docker-entrypoint-initdb.d` mechanism. You don't need to run it manually.

**Extension Details:**
- **pgvector**: Vector similarity search for PostgreSQL
- Used for AI/ML features and semantic search
- Installed from the official `pgvector/pgvector:pg16` Docker image

## How It Works

The `postgres-init.sh` script is mounted into the PostgreSQL container at:
```
/docker-entrypoint-initdb.d/init-pgvector.sh
```

PostgreSQL automatically executes all scripts in this directory on first initialization (when the data directory is empty).

## Verification

To verify pgvector is installed:

```bash
docker exec -it complytude-postgres psql -U postgres -d complytude -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

Expected output:
```
 extname | extversion
---------+------------
 vector  | 0.7.0
(1 row)
```
