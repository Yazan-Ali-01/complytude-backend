# ============================================
# Multi-Stage Dockerfile for Complytude Worker AI
# ============================================
# Build for production:
#   docker build -f apps/worker-ai/Dockerfile -t complytude-worker-ai:latest --target production .
# ============================================

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22.16.0-alpine AS dependencies

# Install pnpm globally
RUN npm install -g pnpm@9

# Set working directory
WORKDIR /app

# Copy root package files and workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy app package.json so pnpm workspace resolves correctly
COPY apps/worker-ai/package.json ./apps/worker-ai/package.json

# Install ALL dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM node:22.16.0-alpine AS build

# Install pnpm globally
RUN npm install -g pnpm@9

WORKDIR /app

# Copy all dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and config files
COPY . .

# Build only the worker-ai application
RUN pnpm build:worker-ai

# Prune dev dependencies after build
RUN pnpm prune --prod

# ============================================
# Stage 3: Production (optimized)
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

# Copy built worker-ai application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/worker-ai ./dist/apps/worker-ai

# Copy necessary config files
COPY --chown=nestjs:nodejs package.json ./

# Switch to non-root user
USER nestjs

# Expose application port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start production server
CMD ["node", "dist/apps/worker-ai/main"]
