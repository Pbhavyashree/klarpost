# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-worker.mjs scripts/
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Web app: Next.js standalone output, no dev dependencies.
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# Reminder worker: runs the TypeScript script directly with tsx.
FROM deps AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY . .
USER node
CMD ["npx", "tsx", "scripts/reminder-worker.ts"]
