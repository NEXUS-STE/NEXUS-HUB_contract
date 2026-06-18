# apps/api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/ ./packages/

RUN npm install
COPY . .
RUN npm run build --workspace=apps/api

# ── Production Image ─────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages/database/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/main"]
