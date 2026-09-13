# ==============================================================================
# Multi-Stage Production Dockerfile for CRM Backend API & Background Worker
# Targeted for: Google Cloud Run & Container Registry
# Base: Node 20 Alpine | Non-Root User: node | Process Manager: dumb-init
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependency Installation
# ------------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable PNPM package manager
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package manifests for isolated cache invalidation
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install full dependencies for building
RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: Build Application & Packages
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json* ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Compile TypeScript packages and NestJS API
RUN pnpm --filter "@crm/*" build && pnpm --filter api build

# Prune development dependencies for lean production runner
RUN pnpm --filter api --prod deploy /app/pruned-api

# ------------------------------------------------------------------------------
# Stage 3: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding (SIGTERM / SIGINT)
# and curl for container health check
RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
ENV PORT=8080

# Switch to standard non-root user
USER node

# Copy built application and pruned production dependencies
COPY --chown=node:node --from=builder /app/packages/config/dist ./packages/config/dist
COPY --chown=node:node --from=builder /app/packages/config/package.json ./packages/config/package.json
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/pruned-api/node_modules ./node_modules
COPY --chown=node:node database/ ./database/

EXPOSE 8080

# Healthcheck for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/healthz || exit 1

# Default Entrypoint: API Service
# For Worker Service: override CMD with ["dumb-init", "node", "apps/api/dist/src/worker.main.js"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/src/main.js"]
