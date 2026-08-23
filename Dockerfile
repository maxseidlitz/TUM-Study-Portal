# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
ARG NODE_IMAGE=node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b

FROM ${NODE_IMAGE} AS native-base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

FROM native-base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

FROM native-base AS frontend-build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3443 \
    DATABASE_PATH=/var/lib/tum-study-portal/study-portal.sqlite \
    BACKUP_DIR=/var/lib/tum-study-portal/backups \
    BUILD_DIR=/app/build
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=frontend-build /app/build ./build
COPY --chown=node:node server ./server
RUN mkdir -p /var/lib/tum-study-portal/backups \
 && chown -R node:node /var/lib/tum-study-portal
USER node
EXPOSE 3443
VOLUME ["/var/lib/tum-study-portal"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3443/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
CMD ["node", "server/server.js"]
