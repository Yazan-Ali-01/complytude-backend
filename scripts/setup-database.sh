#!/bin/bash

# ============================================================================
# Complete Database Setup Script
# ============================================================================
# Description: Runs migrations and seeds in one command
# Usage: ./scripts/setup-database.sh [environment] [--skip-seeds]
# Environment: development (default) | staging | production
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

ENVIRONMENT=${1:-development}
SKIP_SEEDS=false

# Parse arguments
for arg in "$@"; do
    if [ "$arg" = "--skip-seeds" ]; then
        SKIP_SEEDS=true
    fi
done

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================================================
# Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}============================================================================${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}============================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# ============================================================================
# Main Setup
# ============================================================================

clear
print_header "Complytude Database Setup - ${ENVIRONMENT}"

echo -e "${BLUE}This script will:${NC}"
echo "  1. Run all database migrations (schema)"
if [ "$SKIP_SEEDS" = false ]; then
    echo "  2. Seed initial data (authorities, categories)"
    if [ "$ENVIRONMENT" = "development" ]; then
        echo "  3. Seed test data (tenants, users, templates, documents)"
    fi
fi
echo ""

# ============================================================================
# Step 1: Run Migrations
# ============================================================================

print_header "Step 1: Running Database Migrations"

if [ ! -f "${SCRIPT_DIR}/run-migrations.sh" ]; then
    print_error "Migration script not found: ${SCRIPT_DIR}/run-migrations.sh"
    exit 1
fi

echo -e "${BLUE}Executing migrations...${NC}"
bash "${SCRIPT_DIR}/run-migrations.sh"

migration_exit_code=$?
if [ $migration_exit_code -ne 0 ]; then
    print_error "Migrations failed!"
    exit 1
fi

print_success "Migrations completed successfully"

# ============================================================================
# Step 2: Run Seeds (if not skipped)
# ============================================================================

if [ "$SKIP_SEEDS" = false ]; then
    print_header "Step 2: Seeding Database"
    
    if [ ! -f "${SCRIPT_DIR}/run-seeds.sh" ]; then
        print_error "Seeding script not found: ${SCRIPT_DIR}/run-seeds.sh"
        exit 1
    fi
    
    echo -e "${BLUE}Executing seed scripts...${NC}"
    bash "${SCRIPT_DIR}/run-seeds.sh" "$ENVIRONMENT"
    
    seeds_exit_code=$?
    if [ $seeds_exit_code -ne 0 ]; then
        print_error "Seeding failed!"
        exit 1
    fi
    
    print_success "Seeding completed successfully"
else
    print_info "Skipping seeds (--skip-seeds flag provided)"
fi

# ============================================================================
# Final Summary
# ============================================================================

print_header "Setup Complete! 🎉"

echo -e "${GREEN}${BOLD}Your database is ready to use!${NC}"
echo ""

if [ "$ENVIRONMENT" = "development" ]; then
    echo -e "${CYAN}${BOLD}Quick Start Guide:${NC}"
    echo ""
    echo -e "${YELLOW}1. Start the development server:${NC}"
    echo "   pnpm start:dev"
    echo ""
    echo -e "${YELLOW}2. Test Authentication:${NC}"
    echo "   Email: admin@tenant1.test"
    echo "   Password: Test123!@#"
    echo ""
    echo -e "${YELLOW}3. Access API Documentation:${NC}"
    echo "   http://localhost:3000/docs"
    echo ""
    echo -e "${YELLOW}4. Test RLS Tenant Isolation:${NC}"
    echo "   - Login as admin@tenant1.test (should see 3 documents)"
    echo "   - Login as admin@tenant2.test (should see 2 different documents)"
    echo ""
    echo -e "${CYAN}Test Data Summary:${NC}"
    echo "  • 3 Tenants (Pro, Basic, Enterprise)"
    echo "  • 7 Users (various roles)"
    echo "  • 10 Authorities"
    echo "  • 10 Categories"
    echo "  • 5 Templates"
    echo "  • 7 Documents (spread across tenants)"
    echo ""
fi

if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}Important Notes for ${ENVIRONMENT}:${NC}"
    echo "  • Review seeded data to ensure it's appropriate"
    echo "  • Consider removing test users and documents"
    echo "  • Update default passwords if any were seeded"
    echo ""
fi

echo -e "${GREEN}${BOLD}Next Steps:${NC}"
echo "  • Review database: psql -d ${DB_NAME:-complytude}"
echo "  • Check logs for any warnings"
echo "  • Start your application"
echo ""

print_success "Database setup completed successfully!"
echo ""
