# ============================================
# Multi-Stage Dockerfile for Complytude API
# ============================================
# This Dockerfile supports both development and production builds
# 
# Build for production:
#   docker build -f apps/api/Dockerfile -t complytude-api:latest --target production .
#
# Build for development:
#   docker build -f apps/api/Dockerfile -t complytude-api:dev --target development .
# ============================================

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22.16.0-alpine AS dependencies

# Install pnpm globally
RUN npm install -g pnpm@9

# Set working directory
WORKDIR /app

# Copy package files (from root for monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build (for production)
# ============================================
FROM node:22.16.0-alpine AS build

# Install pnpm globally
RUN npm install -g pnpm@9

WORKDIR /app

# Copy all dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and config files
COPY . .

# Build only the API application
RUN pnpm build:api

# Prune dev dependencies after build
RUN pnpm prune --prod

# ============================================
# Stage 3: Development (for hot-reload)
# ============================================
FROM node:22.16.0-alpine AS development

# Install pnpm globally
RUN npm install -g pnpm@9

WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package files and configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nest-cli.json tsconfig.json tsconfig.build.json ./

# Copy API source code
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.app.json ./apps/api/tsconfig.app.json

# Copy shared libraries (if they exist)
COPY libs/shared/src ./libs/shared/src
COPY libs/shared/tsconfig.lib.json ./libs/shared/tsconfig.lib.json
COPY libs/shared/package.json ./libs/shared/package.json

# Copy i18n locales (required for nestjs-i18n)
COPY apps/api/src/i18n ./apps/api/src/i18n

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start development server with hot-reload
CMD ["pnpm", "start:api"]

# ============================================
# Stage 4: Production (optimized)
# ============================================
FROM node:22.16.0-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy production dependencies from build stage (after pruning)
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy built API application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/api ./dist/apps/api

# Copy necessary config files
COPY --chown=nestjs:nodejs package.json ./

# Switch to non-root user
USER nestjs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start production server
CMD ["node", "dist/apps/api/main"]
