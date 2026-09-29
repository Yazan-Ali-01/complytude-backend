# ============================================
# Multi-Stage Dockerfile for Complytude Worker Generation
# ============================================
# Build for production:
#   docker build -f apps/worker-generation/Dockerfile -t complytude-worker-generation:latest --target production .
# ============================================

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS dependencies

# Install pnpm globally
RUN npm install -g pnpm@9.15.9

# Set working directory
WORKDIR /app

# Copy root package files, workspace manifests, and pnpm config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Copy app package.json so pnpm workspace resolves correctly
COPY apps/worker-generation/package.json ./apps/worker-generation/package.json

# Install ALL dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# The app's production dependencies alone (apps/worker-generation/package.json, without the dev toolchain),
# for the production stage. `pnpm prune --prod` does nothing at a workspace root.
RUN pnpm --filter @complytude/worker-generation --prod deploy /prod

# ============================================
# Stage 2: Build
# ============================================
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS build

# Install pnpm globally
RUN npm install -g pnpm@9.15.9

WORKDIR /app

# Copy all dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and config files
COPY . .

# Build only the worker-generation application
RUN pnpm build:worker-generation

# ============================================
# Stage 3: Production (optimized)
# ============================================
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS production

# Production behaviour (JSON logs, no Swagger) even when run outside ECS
ENV NODE_ENV=production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Production dependencies only
COPY --from=dependencies --chown=nestjs:nodejs /prod/node_modules ./node_modules

# Copy built worker-generation application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/worker-generation ./dist/apps/worker-generation

# Amazon RDS CA bundle: the DB server certificate is verified against it (DB_SSL_CA_PATH)
COPY --from=build --chown=nestjs:nodejs /app/libs/database/certs ./certs

# Copy necessary config files
COPY --chown=nestjs:nodejs package.json ./

# Switch to non-root user
USER nestjs

# Expose application port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start production server
CMD ["node", "dist/apps/worker-generation/main"]
