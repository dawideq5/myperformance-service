# syntax=docker/dockerfile:1.7

############################################
# MyPerformance Dashboard - Next.js 15
# Multi-stage build (deps → builder → runner)
############################################

ARG NODE_VERSION=22-alpine

# -----------------------------------------------------------------------------
# Stage 1: base image
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: install dependencies (always include dev deps for the build stage)
# -----------------------------------------------------------------------------
FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
        npm ci --include=dev --no-audit --no-fund; \
    else \
        npm install --include=dev --no-audit --no-fund; \
    fi

# -----------------------------------------------------------------------------
# Stage 3: build the Next.js application
# -----------------------------------------------------------------------------
FROM base AS builder

# Only public build-time variables belong here - no secrets.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM
ARG NEXT_PUBLIC_KEYCLOAK_ISSUER
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_ISSUER=${NEXT_PUBLIC_KEYCLOAK_ISSUER}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 4: runtime image
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache curl tini openssl \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs \
 && mkdir -p /app/public \
 && chown -R nextjs:nodejs /app

# Standalone Next.js output is fully self-contained.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
