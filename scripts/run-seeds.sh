#!/bin/bash

# ============================================================================
# Database Seeding Script
# ============================================================================
# Description: Runs the seed scripts in the correct order
# Usage: ./scripts/run-seeds.sh [environment] [--list]
# Environment: development (default) | test | staging | production
#
# Reference data (authorities, categories) loads everywhere. Test fixtures (tenants and
# users with a published password, sample templates, demo rulesets, stale plan data) load
# only when the environment is development/test AND NODE_ENV is unset or development/test.
# Plans and features reach every environment from EntitlementSyncService on API startup.
# --list prints what would run and exits without touching the database.
# ============================================================================

set -e  # Exit on error
set -o pipefail  # a failing psql must not be hidden by the pipe to cat

# ============================================================================
# Configuration
# ============================================================================

ENVIRONMENT=development
LIST_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --list) LIST_ONLY=true ;;
        -*) echo "Unknown option: $arg" >&2; exit 2 ;;
        *) ENVIRONMENT="$arg" ;;
    esac
done

case "$ENVIRONMENT" in
    development|test|staging|production) ;;
    *) echo "Unknown environment: $ENVIRONMENT (expected development|test|staging|production)" >&2; exit 2 ;;
esac

# NODE_ENV as the caller set it; checked again after the .env files are sourced below
CALLER_NODE_ENV="${NODE_ENV:-}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDS_DIR="${SCRIPT_DIR}/seeds"

# ============================================================================
# Load Environment Variables
# ============================================================================

if [ -f "${SCRIPT_DIR}/../apps/api/.env" ]; then
    echo -e "${BLUE}Loading environment variables from apps/api/.env...${NC}"
    set -a
    source "${SCRIPT_DIR}/../apps/api/.env"
    set +a
elif [ -f "${SCRIPT_DIR}/../.env.api" ]; then
    echo -e "${BLUE}Loading environment variables from .env.api (legacy)...${NC}"
    set -a
    source "${SCRIPT_DIR}/../.env.api"
    set +a
elif [ -f "${SCRIPT_DIR}/../.env" ]; then
    echo -e "${BLUE}Loading environment variables from .env...${NC}"
    set -a
    source "${SCRIPT_DIR}/../.env"
    set +a
elif [ -f "${SCRIPT_DIR}/../.env.${ENVIRONMENT}" ]; then
    echo -e "${BLUE}Loading environment variables from .env.${ENVIRONMENT}...${NC}"
    set -a
    source "${SCRIPT_DIR}/../.env.${ENVIRONMENT}"
    set +a
else
    echo -e "${YELLOW}Warning: No .env file found. Using existing environment variables.${NC}"
fi

# ============================================================================
# Seed Plan: reference data everywhere, test fixtures only in development/test
# ============================================================================

# Safe in every environment
REFERENCE_SEEDS=(
    "001_seed_authorities.sql"
    "002_seed_categories.sql"
)

# Development/test only, in dependency order (after the reference seeds).
# Note: RBAC (roles/permissions) is auto-synced by TenantRbacSyncService on app startup
FIXTURE_SEEDS=(
    "003_seed_test_tenants_users.sql"    # users with a published password
    "004_seed_templates.sql"             # created_by = test users
    "005_seed_test_documents.sql"
    "006_seed_features_plans.sql"        # drifts from PLAN_CATALOG; the app syncs plans itself
    "007_seed_test_subscriptions.sql"    # Runs after plans exist
    "008_seed_test_entitlements.sql"
    "009_seed_rulesets.sql"              # demo rulesets, created_by = seeded superadmin
    "010_seed_ruleset_chunks.sql"
)

is_dev_env() {
    case "$1" in
        development|test) return 0 ;;
        *) return 1 ;;
    esac
}

FIXTURES_ALLOWED=true
FIXTURES_BLOCKED_BY=""
if ! is_dev_env "$ENVIRONMENT"; then
    FIXTURES_ALLOWED=false
    FIXTURES_BLOCKED_BY="environment '${ENVIRONMENT}'"
fi
for node_env in "$CALLER_NODE_ENV" "${NODE_ENV:-}"; do
    if [ -n "$node_env" ] && ! is_dev_env "$node_env"; then
        FIXTURES_ALLOWED=false
        FIXTURES_BLOCKED_BY="NODE_ENV=${node_env}"
    fi
done

print_seed_plan() {
    echo "Environment: ${ENVIRONMENT} (NODE_ENV=${NODE_ENV:-unset})"
    for seed in "${REFERENCE_SEEDS[@]}"; do
        echo "run:  ${seed}"
    done
    for seed in "${FIXTURE_SEEDS[@]}"; do
        if [ "$FIXTURES_ALLOWED" = true ]; then
            echo "run:  ${seed}"
        else
            echo "skip: ${seed} (test fixture; not loaded for ${FIXTURES_BLOCKED_BY})"
        fi
    done
}

if [ "$LIST_ONLY" = true ]; then
    print_seed_plan
    exit 0
fi

# ============================================================================
# Database Connection
# ============================================================================

# Database connection details
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-complytude}
DB_USER=${DB_USER:-postgres}

# Construct connection string
if [ -n "$DATABASE_URL" ]; then
    CONN_STRING="$DATABASE_URL"
else
    # Prompt for password if not set
    if [ -z "$DB_PASSWORD" ]; then
        echo -e "${YELLOW}Enter database password for user ${DB_USER}:${NC}"
        read -s DB_PASSWORD
    fi
    CONN_STRING="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

# ============================================================================
# Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}============================================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}============================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

run_seed_file() {
    local file=$1
    local pg_options=${2:-}
    local filename=$(basename "$file")

    echo -e "${BLUE}Running: ${filename}${NC}"

    # Disable pager and run quietly to avoid "more..." prompts.
    # Fixtures get complytude.allow_fixtures=on; 003 refuses to run without it.
    if PGOPTIONS="$pg_options" PAGER="" PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$file" -v ON_ERROR_STOP=1 -q 2>&1 | cat; then
        print_success "Completed: ${filename}"
        return 0
    else
        print_error "Failed: ${filename}"
        return 1
    fi
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

print_header "Database Seeding - ${ENVIRONMENT} Environment"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    print_error "psql is not installed. Please install PostgreSQL client tools."
    exit 1
fi

# Test database connection
echo -e "${BLUE}Testing database connection...${NC}"
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    print_error "Cannot connect to database. Please check your connection settings."
    echo -e "${YELLOW}Connection details:${NC}"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Password: ${DB_PASSWORD:+[set]}${DB_PASSWORD:-[not set]}"
    exit 1
fi
print_success "Database connection successful"

# Check if seeds directory exists
if [ ! -d "$SEEDS_DIR" ]; then
    print_error "Seeds directory not found: $SEEDS_DIR"
    exit 1
fi

# ============================================================================
# Run Seed Scripts
# ============================================================================

print_header "Executing Seed Scripts"

echo -e "${BLUE}Database: ${DB_NAME}${NC}"
echo -e "${BLUE}Seeds Directory: ${SEEDS_DIR}${NC}"
print_seed_plan
echo ""

if [ "$FIXTURES_ALLOWED" != true ]; then
    print_warning "Test fixtures skipped for ${FIXTURES_BLOCKED_BY}: they create accounts with a published password."
    echo ""
fi

SEED_FILES=("${REFERENCE_SEEDS[@]}")
if [ "$FIXTURES_ALLOWED" = true ]; then
    SEED_FILES+=("${FIXTURE_SEEDS[@]}")
fi

is_fixture() {
    local candidate=$1
    for fixture in "${FIXTURE_SEEDS[@]}"; do
        [ "$fixture" = "$candidate" ] && return 0
    done
    return 1
}

FAILED_COUNT=0
SUCCESS_COUNT=0

# Execute each seed file
# Temporarily disable exit on error to allow error handling
set +e
for seed_file in "${SEED_FILES[@]}"; do
    file_path="${SEEDS_DIR}/${seed_file}"

    if [ ! -f "$file_path" ]; then
        print_warning "Seed file not found: ${seed_file} (skipping)"
        continue
    fi

    pg_options=""
    if is_fixture "$seed_file"; then
        pg_options="-c complytude.allow_fixtures=on"
    fi

    if run_seed_file "$file_path" "$pg_options"; then
        ((SUCCESS_COUNT++))
    else
        ((FAILED_COUNT++))
        print_error "Seeding failed at: ${seed_file}"

        echo -e "${YELLOW}Do you want to continue with remaining seeds? (y/n)${NC}"
        read -r continue_choice

        if [ "$continue_choice" != "y" ] && [ "$continue_choice" != "Y" ]; then
            print_warning "Seeding aborted by user."
            set -e  # Re-enable before exit
            exit 1
        fi
    fi

    echo ""
done
# Re-enable exit on error
set -e

# ============================================================================
# Summary
# ============================================================================

print_header "Seeding Summary"

echo -e "${GREEN}Successful: ${SUCCESS_COUNT}${NC}"
echo -e "${RED}Failed: ${FAILED_COUNT}${NC}"
echo ""

if [ $FAILED_COUNT -eq 0 ]; then
    print_success "All seed scripts completed successfully!"

    # Display some statistics
    echo ""
    echo -e "${BLUE}Database Statistics:${NC}"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
        SELECT
            'Tenants' as table_name,
            COUNT(*)::text as count
        FROM public.tenants
        UNION ALL
        SELECT 'Users', COUNT(*)::text FROM public.users
        UNION ALL
        SELECT 'Authorities', COUNT(*)::text FROM public.authorities
        UNION ALL
        SELECT 'Categories', COUNT(*)::text FROM public.categories
        UNION ALL
        SELECT 'Templates', COUNT(*)::text FROM public.templates
        UNION ALL
        SELECT 'Documents', COUNT(*)::text FROM public.documents
        ORDER BY table_name;
    "

    echo ""
    if [ "$FIXTURES_ALLOWED" = true ]; then
        print_success "Database is ready for testing!"
        echo ""
        echo -e "${YELLOW}Test Credentials (development/test only):${NC}"
        echo "  Email: admin@tenant1.test"
        echo "  Password: Test123!@#"
        echo ""
    else
        print_success "Reference data loaded. Create a platform admin with: pnpm admin:grant <email>"
        echo ""
    fi

    exit 0
else
    print_error "Some seed scripts failed. Please check the errors above."
    exit 1
fi
