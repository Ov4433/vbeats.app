# VBeats backend API — multi-stage production image.
#
# Build from the REPO ROOT so brand assets are included:
#   docker build -f backend/Dockerfile .
# (docker-compose.yml at the repo root already does this.)

# ---------- deps: install dependencies + generate Prisma client ----------
FROM node:20-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --no-audit --no-fund
# generate only parses the schema (no DB connection), but the var must exist
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vbeats
RUN npx prisma generate

# ---------- build: compile TypeScript ----------
FROM node:20-slim AS build
WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/ ./
RUN npm run build

# ---------- runner: production image ----------
FROM node:20-slim AS runner
WORKDIR /app/backend
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/backend/uploads \
    BRAND_DIR=/app/brand
# Prisma's schema/migration engines need OpenSSL at runtime; node:20-slim
# does not ship it (without this, `prisma migrate deploy` dies with an
# empty "Schema engine error" on startup).
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Full node_modules (incl. prisma CLI for `migrate deploy` on startup).
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/package.json ./package.json
COPY brand /app/brand
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/backend/uploads \
  && chown -R node:node /app/backend /app/brand
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;fetch('http://localhost:'+p+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
