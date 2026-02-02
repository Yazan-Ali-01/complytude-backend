#!/bin/bash

# ============================================================================
# Database Migration Runner
# ============================================================================
# Runs all migration files in order
# Usage: ./scripts/run-migrations.sh
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
    export $(cat apps/api/.env | grep -v '^#' | grep -v '^\s*$' | xargs)
    echo "📝 Loaded environment from apps/api/.env"
elif [ -f .env.api ]; then
    export $(cat .env.api | grep -v '^#' | grep -v '^\s*$' | xargs)
    echo "📝 Loaded environment from .env.api (legacy)"
elif [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^\s*$' | xargs)
    echo "📝 Loaded environment from .env"
else
    echo -e "${RED}❌ No .env file found${NC}"
    echo "Please create apps/api/.env from apps/api/.env.example"
    exit 1
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
    echo "  1. Docker is running: pnpm docker:start"
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

# Create migrations tracking table
echo "📋 Creating migrations tracking table..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 <<EOF
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF

echo -e "${GREEN}✅ Migrations table ready${NC}"
echo ""

# Run migrations in order
MIGRATION_DIR="./scripts/migrations"
MIGRATION_COUNT=0
SKIPPED_COUNT=0

echo "🔄 Running migrations..."
echo "-----------------------------------"

for migration_file in $(ls -1 $MIGRATION_DIR/*.sql | sort); do
    migration_name=$(basename $migration_file)
    
    # Check if migration already executed
    set +e
    already_run=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc \
        "SELECT COUNT(*) FROM public.schema_migrations WHERE migration_name = '$migration_name'" 2>&1)
    check_exit_code=$?
    set -e
    
    if [ $check_exit_code -ne 0 ]; then
        echo -e "${RED}❌ Error checking migration status: $migration_name${NC}"
        echo "$already_run"
        exit 1
    fi
    
    if [ "$already_run" -gt 0 ]; then
        echo -e "${YELLOW}⏭  Skipping${NC} $migration_name (already executed)"
        set +e
        ((SKIPPED_COUNT++))
        set -e
        continue
    fi
    
    echo -e "${GREEN}▶  Running${NC} $migration_name..."
    
    # Run migration - capture output to show errors
    # Temporarily disable set -e to capture exit code
    set +e
    migration_output=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f "$migration_file" 2>&1)
    migration_exit_code=$?
    set -e
    
    if [ $migration_exit_code -eq 0 ]; then
        # Record successful migration
        set +e
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c \
            "INSERT INTO public.schema_migrations (migration_name) VALUES ('$migration_name')" > /dev/null 2>&1
        set -e
        
        echo -e "${GREEN}   ✅ Success${NC}"
        set +e
        ((MIGRATION_COUNT++))
        set -e
    else
        echo -e "${RED}   ❌ Failed${NC}"
        echo ""
        echo "Migration failed: $migration_name"
        echo ""
        echo -e "${RED}Error output:${NC}"
        echo "$migration_output"
        echo ""
        echo "Please check the error above and fix before continuing."
        exit 1
    fi
done

echo "-----------------------------------"
echo ""

# Summary
echo "📊 Migration Summary"
echo "-----------------------------------"
echo "  Executed: $MIGRATION_COUNT"
echo "  Skipped:  $SKIPPED_COUNT"
echo "  Total:    $((MIGRATION_COUNT + SKIPPED_COUNT))"
echo ""

if [ $MIGRATION_COUNT -gt 0 ]; then
    echo -e "${GREEN}✅ All migrations completed successfully!${NC}"
else
    echo -e "${YELLOW}ℹ  No new migrations to run${NC}"
fi

echo ""
echo "🎉 Database is ready!"
echo ""
echo "Next steps:"
echo "  1. Start the app: pnpm start:dev"
echo "  2. View API docs: http://localhost:3000/docs"
echo "  3. Check health: http://localhost:3000/api/health"

