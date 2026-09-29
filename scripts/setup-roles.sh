#!/bin/bash

# ============================================================================
# Database Role Setup Script
# ============================================================================
# Sets up app_user and app_login roles with password from environment
# Must be run with admin/superuser privileges BEFORE the first migration (bootstrap).
# An existing app_login keeps its password; set RESET_APP_PASSWORD=1 to rotate it.
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
    -v app_user="$DB_APP_USER" \
    -v app_password="$DB_APP_PASSWORD" \
    -v db_name="$DB_NAME" \
    ${RESET_APP_PASSWORD:+-v reset_password=1} \
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