#!/bin/bash

echo "🚀 Starting Complytude Development Environment"
echo "=============================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    echo ""
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if services are running
postgres_running=false
minio_running=false

if docker ps --format '{{.Names}}' | grep -q '^complytude-postgres$'; then
    postgres_running=true
    echo "✅ PostgreSQL is running"
else
    echo "📦 PostgreSQL is not running"
fi

if docker ps --format '{{.Names}}' | grep -q '^complytude-minio$'; then
    minio_running=true
    echo "✅ MinIO is running"
else
    echo "📦 MinIO is not running"
fi

# Start services if needed
if [ "$postgres_running" = false ] || [ "$minio_running" = false ]; then
    echo ""
    echo "🚀 Starting services..."
    pnpm docker:start || exit 1
fi

echo ""
echo "🔍 Checking database migrations..."

# Check if migrations are needed
DB_PASSWORD=${DB_PASSWORD:-postgres}
needs_migration=false

# Try to connect and check if tables exist
if ! PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5432 -U postgres -d complytude -c '\dt' 2>/dev/null | grep -q 'public'; then
    needs_migration=true
    echo "⚠️  Database needs migrations"
else
    echo "✅ Database appears to be migrated"
    
    # Double-check by looking for a key table
    if ! PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5432 -U postgres -d complytude -c '\dt' 2>/dev/null | grep -q 'users'; then
        needs_migration=true
        echo "⚠️  Core tables missing - migrations needed"
    fi
fi

# Run migrations if needed
if [ "$needs_migration" = true ]; then
    echo ""
    echo "📊 Running database migrations..."
    pnpm db:migrate || {
        echo ""
        echo "❌ Migration failed! Please check the error above."
        exit 1
    }
    echo "✅ Migrations completed"
fi

echo ""
echo "🔥 Starting development server..."
echo "=================================="
echo ""
echo "📚 Available at:"
echo "  • API: http://localhost:3000/api"
echo "  • Swagger: http://localhost:3000/docs"
echo "  • MinIO Console: http://localhost:9001"
echo ""

pnpm start:dev

