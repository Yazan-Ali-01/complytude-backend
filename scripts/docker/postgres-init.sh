#!/bin/bash
set -e

echo "🔧 Initializing PostgreSQL with pgvector extension..."

# Enable pgvector extension in the main database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create pgvector extension if it doesn't exist
    CREATE EXTENSION IF NOT EXISTS vector;
    
    -- Verify extension is installed
    SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
EOSQL

echo "✅ pgvector extension enabled successfully!"
