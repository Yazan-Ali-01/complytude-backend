#!/bin/bash

# Script to start Docker PostgreSQL database
# This checks if Docker is running before attempting to start the database

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

# Check if our postgres container exists
if docker ps -a --format '{{.Names}}' | grep -q '^complytude-postgres$'; then
    echo "📦 Found existing complytude-postgres container"
    
    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q '^complytude-postgres$'; then
        echo "✅ PostgreSQL container is already running"
    else
        echo "🔄 Starting PostgreSQL container..."
        docker start complytude-postgres
    fi
else
    echo "🚀 Creating and starting PostgreSQL container..."
    docker-compose up -d postgres
fi

# Wait a moment for the container to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 3

# Check health
if docker exec complytude-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo ""
    echo "✅ PostgreSQL is ready!"
    echo ""
    echo "📊 Connection details:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: complytude"
    echo "  User: postgres"
    echo ""
    echo "🚀 You can now run: pnpm start:dev"
    echo "📚 API Docs: http://localhost:3000/docs"
    echo "🏥 Health Check: http://localhost:3000/api/health/db"
    echo ""
    echo "📋 Useful commands:"
    echo "  pnpm docker:logs  - View database logs"
    echo "  pnpm docker:down  - Stop database"
    echo "  pnpm docker:reset - Reset database (⚠️  deletes all data)"
else
    echo ""
    echo "⚠️  PostgreSQL container started but not ready yet"
    echo "Run: pnpm docker:logs"
    echo "Or wait a few more seconds and try connecting"
fi

