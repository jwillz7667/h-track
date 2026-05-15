# syntax=docker/dockerfile:1.7
#
# Multi-stage build that produces a ~150MB standalone runtime image.
# Relies on next.config.ts → output: 'standalone' which emits a self-contained
# server.js + minimal node_modules under .next/standalone.

FROM node:22-alpine AS deps
WORKDIR /app
# --legacy-peer-deps is needed because react-simple-maps@3 declares a peer of
# react ≤18 but we ship react 19. Removing the flag will break install.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Persistent cache for last-known-good DashboardData. Mount /data as a
# volume in Railway/Fly so the cache survives container restarts.
ENV HANTACOUNT_CACHE_PATH=/data/hantacount-cache.json

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /data \
 && chown -R nextjs:nodejs /data

USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

EXPOSE 3000

# Uses node 22's global fetch so we don't need to install curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
