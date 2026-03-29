#!/bin/bash

# Script to start Docker services (PostgreSQL + MinIO + Redis)
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

# Detect docker compose command
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Start services
echo "🚀 Starting PostgreSQL, Redis, MinIO, and Gotenberg..."
$DOCKER_COMPOSE up -d postgres redis minio gotenberg

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 3

# Check PostgreSQL health
if docker exec complytude-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL (with pgvector) is ready!"
else
    echo "⚠️  PostgreSQL started but not ready yet"
fi

# Check Redis health
if docker exec complytude-redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready!"
else
    echo "⚠️  Redis started but not ready yet"
fi

# Check MinIO health
if docker exec complytude-minio curl -f http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "✅ MinIO is ready!"
else
    echo "⚠️  MinIO started but not ready yet"
fi

# Check Gotenberg health
if docker exec complytude-gotenberg curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Gotenberg (PDF conversion) is ready!"
else
    echo "⚠️  Gotenberg started but not ready yet"
fi

# Check if MinIO buckets were created
echo "🪣 Checking MinIO buckets..."
sleep 2
if docker ps -a | grep -q complytude-minio-init; then
    echo "✅ MinIO buckets (complytude-quarantine, complytude-clean) created!"
else
    echo "⚠️  MinIO init container not found"
fi

echo ""
echo "📊 Service Connection Details:"
echo ""
echo "PostgreSQL (with pgvector):"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: complytude"
echo "  User: postgres"
echo ""
echo "Redis (for BullMQ):"
echo "  Host: localhost"
echo "  Port: 6379"
echo "  DB: 0"
echo ""
echo "MinIO (S3-Compatible Storage):"
echo "  API Endpoint: http://localhost:9000"
echo "  Console: http://localhost:9001"
echo "  Access Key: minioadmin"
echo "  Secret Key: minioadmin"
echo "  Buckets: complytude-quarantine, complytude-clean"
echo ""
echo "Gotenberg (PDF Conversion):"
echo "  API Endpoint: http://localhost:3100"
echo "  Health: http://localhost:3100/health"
echo "  DOCX→PDF: POST http://localhost:3100/forms/libreoffice/convert"
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

