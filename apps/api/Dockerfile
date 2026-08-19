# =============================================================================
# Parinaam VMS API + worker
# Both processes ship in one image so business logic is never duplicated.
# =============================================================================

# ── base ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package*.json ./

# ── development ───────────────────────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start:dev"]

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ── production ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
