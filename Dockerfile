# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.14-alpine AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json
USER bun
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-10000}/health/live" > /dev/null || exit 1
CMD ["bun", "dist/server.js"]
