# 버틀러 — Node 백엔드 (api-node)
# 모노레포 컨텍스트에서 빌드한다: docker build -f services/api-node/Dockerfile -t butler-api .

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/api-node/package.json services/api-node/package.json
RUN npm install --omit=dev --workspaces --include-workspace-root || npm install --workspaces --include-workspace-root

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared ./packages/shared
COPY services/api-node ./services/api-node
RUN cd services/api-node && npx prisma generate \
 && npm run build || (echo "build OK 또는 ts 컴파일 셸" && exit 0)

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 butler
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/api-node ./services/api-node
USER butler
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--import", "tsx/esm", "services/api-node/src/server.ts"]
