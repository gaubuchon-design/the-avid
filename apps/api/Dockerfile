FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
RUN npm ci

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=@mcua/api

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
