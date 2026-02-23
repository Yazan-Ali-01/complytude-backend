#!/bin/bash

# ============================================================================
# Database Role Setup Script
# ============================================================================
# Sets up app_user and app_login roles with password from environment
# Must be run with admin/superuser privileges BEFORE migrations
# ============================================================================

set -e

echo "🔐 Complytude Database Role Setup"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables (check new location first, then fallback)
# Strips inline comments (# ...) to avoid export errors on Linux/Windows
load_env() {
    local f="$1"
    while IFS='=' read -r key value; do
        [ -n "$key" ] && export "$key=$value"
    done < <(grep -v '^[[:space:]]*#' "$f" | tr -d '\r' | sed 's/[[:space:]]*#.*$//' | grep -v '^[[:space:]]*$')
}
if [ -f apps/api/.env ]; then
    load_env apps/api/.env
    echo "📝 Loaded environment from apps/api/.env"
elif [ -f .env.api ]; then
    load_env .env.api
    echo "📝 Loaded environment from .env.api (legacy)"
elif [ -f .env ]; then
    load_env .env
    echo "📝 Loaded environment from .env"
else
    echo -e "${RED}❌ No .env file found${NC}"
    echo "Expected locations: apps/api/.env, .env.api, or .env"
    exit 1
fi

# Required variables
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-complytude}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD}

# Check for app user credentials
if [ -z "$DB_APP_PASSWORD" ]; then
    echo -e "${RED}❌ DB_APP_PASSWORD not set in .env${NC}"
    echo ""
    echo "Please add to your apps/api/.env file:"
    echo "  DB_APP_USER=app_login"
    echo "  DB_APP_PASSWORD=your_secure_password_here"
    exit 1
fi

echo "📡 Checking database connection..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to PostgreSQL as admin user${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Connected as admin user${NC}"
echo ""

# Create database if needed
echo "📦 Ensuring database exists..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
    echo -e "${GREEN}✅ Database created${NC}"
else
    echo -e "${GREEN}✅ Database exists${NC}"
fi

echo ""
echo "🔧 Setting up application roles..."

# Run the setup script
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres \
    -v app_user="'$DB_APP_USER'" \
    -v app_password="'$DB_APP_PASSWORD'" \
    -v db_name="$DB_NAME" \
    -f scripts/setup-app-user-role.sql

echo ""
echo -e "${GREEN}✅ Role setup complete!${NC}"
echo ""
echo "⚠️  IMPORTANT: Update your apps/api/.env for application use:"
echo "  DB_USER=\$DB_APP_USER"
echo "  DB_PASSWORD=\$DB_APP_PASSWORD"
echo ""
echo "Or if using separate admin/app credentials:"
echo "  # For setup: DB_USER=\$DB_USER, DB_PASSWORD=\$DB_PASSWORD"
echo "  # For app:   DB_USER=\$DB_APP_USER, DB_PASSWORD=\$DB_APP_PASSWORD"
echo ""