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
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS dependencies

# Install pnpm globally
RUN npm install -g pnpm@9.15.9

# Set working directory
WORKDIR /app

# Copy root package files, workspace manifests, and pnpm config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Copy app/lib package.json files so pnpm workspace resolves correctly
COPY apps/api/package.json ./apps/api/package.json

# Install ALL dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# The app's production dependencies alone (apps/api/package.json, without the dev toolchain),
# for the production stage. `pnpm prune --prod` does nothing at a workspace root.
RUN pnpm --filter @complytude/api --prod deploy /prod

# ============================================
# Stage 2: Build (for production)
# ============================================
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS build

# Install pnpm globally
RUN npm install -g pnpm@9.15.9

WORKDIR /app

# Copy all dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and config files
COPY . .

# Build only the API application
RUN pnpm build:api

# ============================================
# Stage 3: Development (for hot-reload)
# ============================================
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS development

# Install pnpm globally
RUN npm install -g pnpm@9.15.9

WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy root package files and configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nest-cli.json tsconfig.json ./

# Copy API app
COPY apps/api/src ./apps/api/src
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.app.json ./apps/api/tsconfig.app.json

# Copy shared libraries
COPY libs/redis/src ./libs/redis/src
COPY libs/redis/tsconfig.lib.json ./libs/redis/tsconfig.lib.json
COPY libs/queue/src ./libs/queue/src
COPY libs/queue/tsconfig.lib.json ./libs/queue/tsconfig.lib.json

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start development server with hot-reload
CMD ["pnpm", "start:api"]

# ============================================
# GeoLite2-City (session locations)
# ============================================
# Downloaded only when the build gets the MaxMind licence key as a secret:
#   docker build --secret id=maxmind_license_key,env=MAXMIND_LICENSE_KEY \
#     --build-arg GEOIP_BUILD=$(date -u +%F) ...
# A secret, not a build arg, so the key is never stored in the image or its history. Without it
# /geoip stays empty and the API runs without session locations (it logs a warning at boot).
FROM node:22.16.0-alpine@sha256:41e4389f3d988d2ed55392df4db1420ad048ae53324a8e2b7c6d19508288107e AS geoip

RUN apk add --no-cache bash curl

# A new value re-runs the download instead of reusing the cached layer: GeoLite2's licence requires
# a database no older than 30 days, so the deploy passes the date
ARG GEOIP_BUILD=
COPY scripts/download-geolite2-city.sh /usr/local/bin/download-geolite2-city.sh
RUN --mount=type=secret,id=maxmind_license_key \
    mkdir -p /geoip && \
    if [ -s /run/secrets/maxmind_license_key ]; then \
      MAXMIND_LICENSE_KEY="$(cat /run/secrets/maxmind_license_key)" \
      MAXMIND_DB_PATH=/geoip/GeoLite2-City.mmdb \
      bash /usr/local/bin/download-geolite2-city.sh; \
    else \
      echo "No MaxMind licence key: building without GeoLite2-City (${GEOIP_BUILD:-local build})"; \
    fi

# ============================================
# Stage 4: Production (optimized)
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

# Copy built API application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/api ./dist/apps/api

# Amazon RDS CA bundle: the DB server certificate is verified against it (DB_SSL_CA_PATH)
COPY --from=build --chown=nestjs:nodejs /app/libs/database/certs ./certs

# GeoLite2-City when the build had the licence key (MAXMIND_DB_PATH defaults to ./data/...)
COPY --from=geoip --chown=nestjs:nodejs /geoip ./data

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
