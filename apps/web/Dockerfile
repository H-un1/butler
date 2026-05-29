# 버틀러 — 웹앱 (임대인 + 관리자, role 분기)
# 모노레포 컨텍스트: docker build -f apps/web/Dockerfile -t butler-web .

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* .npmrc tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install --workspaces --include-workspace-root \
 && npm --workspace apps/web run build

FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
