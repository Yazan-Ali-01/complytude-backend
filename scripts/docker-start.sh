#!/bin/bash

# Script to start Docker services (PostgreSQL + MinIO)
# This checks if Docker is running before attempting to start services

echo "🐳 Checking Docker status..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo ""
    echo "❌ Docker is not running or is paused!"
    echo ""
    echo "Please do one of the following:"
    echo "  1. Click the Docker whale icon in your menu bar and select 'Resume'"
    echo "  2. Open Docker Desktop application"
    echo "  3. Run: open -a Docker"
    echo ""
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start services
echo "🚀 Starting PostgreSQL and MinIO..."
docker-compose up -d postgres minio

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 3

# Check PostgreSQL health
if docker exec complytude-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
else
    echo "⚠️  PostgreSQL started but not ready yet"
fi

# Check MinIO health
if docker exec complytude-minio curl -f http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "✅ MinIO is ready!"
else
    echo "⚠️  MinIO started but not ready yet"
fi

echo ""
echo "📊 Service Connection Details:"
echo ""
echo "PostgreSQL:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: complytude"
echo "  User: postgres"
echo ""
echo "MinIO (S3-Compatible Storage):"
echo "  API Endpoint: http://localhost:9000"
echo "  Console: http://localhost:9001"
echo "  Access Key: minioadmin"
echo "  Secret Key: minioadmin"
echo ""
echo "🚀 Next Steps:"
echo "  pnpm db:migrate  - Run database migrations"
echo "  pnpm start:dev   - Start development server"
echo ""
echo "📚 Useful URLs:"
echo "  API Docs: http://localhost:3000/docs"
echo "  Health Check: http://localhost:3000/api/health"
echo "  MinIO Console: http://localhost:9001"
echo ""
echo "📋 Useful Commands:"
echo "  pnpm docker:logs     - View service logs"
echo "  pnpm docker:stop     - Stop services"
echo "  pnpm docker:up:all   - Start with pgAdmin too"
echo "  pnpm docker:reset    - Reset all data (⚠️  destructive)"
echo ""

