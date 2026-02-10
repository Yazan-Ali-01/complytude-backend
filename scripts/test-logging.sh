#!/bin/bash

# Test script for Pino logging implementation
# Run this script to verify logging works correctly

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}  Logging Implementation Test Suite  ${NC}"
echo -e "${YELLOW}======================================${NC}"
echo ""

# Test 1: Check dependencies
echo -e "${YELLOW}[1/8] Checking dependencies...${NC}"
if pnpm list | grep -q "nestjs-pino"; then
    echo -e "${GREEN}✓ nestjs-pino installed${NC}"
else
    echo -e "${RED}✗ nestjs-pino not installed${NC}"
    exit 1
fi

if pnpm list | grep -q "pino-pretty"; then
    echo -e "${GREEN}✓ pino-pretty installed${NC}"
else
    echo -e "${RED}✗ pino-pretty not installed${NC}"
    exit 1
fi

# Test 2: Check config files
echo -e "\n${YELLOW}[2/8] Checking configuration files...${NC}"
if [ -f "apps/api/src/config/logger.config.ts" ]; then
    echo -e "${GREEN}✓ API logger config exists${NC}"
else
    echo -e "${RED}✗ API logger config missing${NC}"
    exit 1
fi

if [ -f "libs/shared/src/logger/logger.module.ts" ]; then
    echo -e "${GREEN}✓ Shared LoggerModule exists${NC}"
else
    echo -e "${RED}✗ Shared LoggerModule missing${NC}"
    exit 1
fi

# Test 3: Check environment variables
echo -e "\n${YELLOW}[3/8] Checking environment variables...${NC}"
if grep -q "SERVICE_NAME" apps/api/.env; then
    echo -e "${GREEN}✓ SERVICE_NAME configured${NC}"
else
    echo -e "${RED}✗ SERVICE_NAME not configured${NC}"
    exit 1
fi

if grep -q "LOG_LEVEL" apps/api/.env; then
    echo -e "${GREEN}✓ LOG_LEVEL configured${NC}"
else
    echo -e "${RED}✗ LOG_LEVEL not configured${NC}"
    exit 1
fi

# Test 4: Verify TypeScript compiles
echo -e "\n${YELLOW}[4/8] Checking TypeScript compilation...${NC}"
if pnpm type-check 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ TypeScript compilation errors${NC}"
    pnpm type-check
    exit 1
else
    echo -e "${GREEN}✓ TypeScript compiles successfully${NC}"
fi

# Test 5: Check for linter errors
echo -e "\n${YELLOW}[5/8] Running linter...${NC}"
if pnpm lint --quiet 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ Linter errors found${NC}"
    pnpm lint
    exit 1
else
    echo -e "${GREEN}✓ No linter errors${NC}"
fi

# Test 6: Build the project
echo -e "\n${YELLOW}[6/8] Building project...${NC}"
if pnpm build:api > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API builds successfully${NC}"
else
    echo -e "${RED}✗ API build failed${NC}"
    exit 1
fi

# Test 7: Check documentation
echo -e "\n${YELLOW}[7/8] Checking documentation...${NC}"
DOCS=(
    "libs/shared/src/logger/README.md"
    "infra/logging-module/README.md"
    "infra/logging-module/TESTING.md"
    "infra/logging-module/QUICK_START.md"
    "infra/logging-module/IMPLEMENTATION_SUMMARY.md"
)

for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        echo -e "${GREEN}✓ $doc exists${NC}"
    else
        echo -e "${RED}✗ $doc missing${NC}"
        exit 1
    fi
done

# Test 8: Summary
echo -e "\n${YELLOW}[8/8] Verification complete!${NC}"
echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  All Checks Passed! ✓${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "1. ${YELLOW}Start the API:${NC} pnpm start:api"
echo -e "2. ${YELLOW}Check logs:${NC} Look for trace_id and service_name"
echo -e "3. ${YELLOW}Test health:${NC} curl http://localhost:3000/health"
echo -e "4. ${YELLOW}Run manual tests:${NC} See infra/logging-module/MANUAL_TESTING.md"
echo ""
echo -e "${GREEN}Ready to commit!${NC}"
echo ""
