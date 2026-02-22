# ─── Stage 1: Build frontend ───────────────────────────────────────────────
FROM node:22-alpine AS build-frontend
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/

RUN npm ci

# Copy source and build
COPY packages/shared/ ./packages/shared/
COPY packages/frontend/ ./packages/frontend/

RUN npm run build -w @sectorama/shared
RUN npm run build -w @sectorama/frontend

# ─── Stage 2: Build backend ────────────────────────────────────────────────
FROM node:22-alpine AS build-backend
WORKDIR /app

# Build tools required to compile better-sqlite3 native module on Alpine (musl)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY packages/backend/ ./packages/backend/

RUN npm run build -w @sectorama/shared
RUN npm run build -w @sectorama/backend

# Remove devDependencies to slim the production node_modules
RUN npm prune --omit=dev

# ─── Stage 3: Production image ─────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# smartctl for disk discovery and SMART polling; fio for benchmark profiles
RUN apk add --no-cache smartmontools fio

# Copy production node_modules and compiled output from build-backend
COPY --from=build-backend /app/node_modules ./node_modules
COPY --from=build-backend /app/packages/shared/dist ./packages/shared/dist
COPY --from=build-backend /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build-backend /app/packages/backend/dist ./packages/backend/dist
COPY --from=build-backend /app/packages/backend/package.json ./packages/backend/package.json

# Copy built frontend — served as static files by the backend
COPY --from=build-frontend /app/packages/frontend/dist ./public

# Persistent volume for SQLite database
VOLUME ["/data"]

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8888/api/v1/health || exit 1

CMD ["node", "packages/backend/dist/server.js"]
