# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=bind,target=/source \
    --mount=type=tmpfs,target=/tmp/npm-cache \
    --mount=type=tmpfs,target=/app/node_modules \
    cp -a /source/. /app/ && \
    npm ci --ignore-scripts --no-audit --cache /tmp/npm-cache && \
    npm run build && \
    mkdir -p /output/.next && \
    cp -a .next/standalone/. /output/ && \
    cp -a .next/static /output/.next/static && \
    cp -a public /output/ && \
    rm -rf /app/.next /app/src /app/tests
FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /output /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
