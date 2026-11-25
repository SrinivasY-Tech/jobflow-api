# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Multi-stage build: compile with dev dependencies, ship without them.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine

# 1) deps: install ALL dependencies (incl. dev) exactly as locked.
#    Copying only package*.json first means this layer is cached until
#    the lockfile changes, so code edits don't trigger a full reinstall.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) build: compile TypeScript -> dist/ (needs typescript + @nestjs/cli).
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# 3) prod-deps: a clean node_modules with runtime dependencies only.
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 4) runtime: the only stage that ends up in the final image.
#    No compiler, no dev deps, no source .ts files.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Files stay root-owned (read-only for the app); the process runs unprivileged.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# exec form: node is PID 1 and receives SIGTERM directly for graceful shutdown.
CMD ["node", "dist/main.js"]
