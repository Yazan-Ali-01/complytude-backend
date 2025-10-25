#!/bin/bash

# Setup Test Database Script
# This script initializes the test database with required migrations

set -e  # Exit on error

echo "🔧 Setting up test database..."

# Database configuration
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_PASSWORD="${DATABASE_PASSWORD:-postgres}"
DB_NAME="${DATABASE_NAME:-complytude_test}"

export PGPASSWORD="$DB_PASSWORD"

echo "📋 Database: $DB_NAME"
echo "📍 Host: $DB_HOST:$DB_PORT"
echo ""

# Check if PostgreSQL is running
echo "⏳ Checking PostgreSQL connection..."
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on $DB_HOST:$DB_PORT"
    echo "   Run: npm run docker:up"
    exit 1
fi
echo "✅ PostgreSQL is running"

# Create test database if it doesn't exist
echo "⏳ Creating test database if needed..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
echo "✅ Test database ready: $DB_NAME"

# Run migrations
echo "⏳ Running migrations..."
for migration in scripts/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Running: $(basename $migration)"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" > /dev/null 2>&1 || {
            echo "   ⚠️  Migration already applied or error occurred"
        }
    fi
done
echo "✅ Migrations completed"

# Seed initial data if needed
if [ -f "scripts/seed-templates-data.sql" ]; then
    echo "⏳ Seeding template data..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "scripts/seed-templates-data.sql" > /dev/null 2>&1 || {
        echo "   ⚠️  Seed data already exists or error occurred"
    }
    echo "✅ Seed data loaded"
fi

# Verify database structure
echo "⏳ Verifying database structure..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "✅ Database structure verified ($TABLE_COUNT tables found)"
else
    echo "❌ No tables found in database"
    exit 1
fi

echo ""
echo "🎉 Test database setup complete!"
echo ""
echo "You can now run tests with:"
echo "  npm run test:e2e"

