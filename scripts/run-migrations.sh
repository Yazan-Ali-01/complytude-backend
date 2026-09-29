#!/bin/bash

# ============================================================================
# Database Migration Runner
# ============================================================================
# Creates the database if needed, then applies pending migrations with scripts/migrate.ts
# Usage: ./scripts/run-migrations.sh [--check]
# ============================================================================

set -e  # Exit on error

echo "🚀 Complytude Database Migration Runner"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables (check new location first, then fallback)
if [ -f apps/api/.env ]; then
    export $(cat apps/api/.env | grep -v '^#' | grep -v '^\s*$' | sed 's/[[:space:]]*#.*$//' | xargs)
    echo "📝 Loaded environment from apps/api/.env"
elif [ -f .env.api ]; then
    export $(cat .env.api | grep -v '^#' | grep -v '^\s*$' | sed 's/[[:space:]]*#.*$//' | xargs)
    echo "📝 Loaded environment from .env.api (legacy)"
elif [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^\s*$' | sed 's/[[:space:]]*#.*$//' | xargs)
    echo "📝 Loaded environment from .env"
else
    echo -e "${YELLOW}⚠️  No .env file found. Using environment variables from shell.${NC}"
fi

# Database connection details
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-complytude}
DB_USER=${DB_USER:-postgres}

# Check if PostgreSQL is accessible
echo "📡 Checking database connection..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to PostgreSQL${NC}"
    echo ""
    echo "Please check:"
    echo "  1. Docker is running: pnpm services:up"
    echo "  2. Database credentials in apps/api/.env"
    echo "  3. PostgreSQL is accessible on ${DB_HOST}:${DB_PORT}"
    exit 1
fi

echo -e "${GREEN}✅ Database connection successful${NC}"
echo ""

# Create database if it doesn't exist
echo "📦 Checking if database '$DB_NAME' exists..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "Creating database '$DB_NAME'..."
    PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
    echo -e "${GREEN}✅ Database created${NC}"
else
    echo -e "${GREEN}✅ Database exists${NC}"
fi

echo ""

# Apply pending migrations with the shared runner (checksums, one transaction per migration, lock).
# Pass --check to only verify that no applied migration was edited.
echo "🔄 Running migrations..."
echo "-----------------------------------"
DB_HOST=$DB_HOST DB_PORT=$DB_PORT DB_NAME=$DB_NAME DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD \
    npx ts-node --transpile-only scripts/migrate.ts "$@"
echo "-----------------------------------"
echo ""
echo "🎉 Database is ready!"
echo ""
echo "Next steps:"
echo "  1. Start the app: pnpm start:dev"
echo "  2. View API docs: http://localhost:3000/docs"
echo "  3. Check health: http://localhost:3000/api/health"

