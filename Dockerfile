# Phase 77 — Kikigaki Blog self-host（node runtime；與 Cloudflare 版同 repo 雙 adapter）
# 用法：docker compose up -d --build（見 compose.yaml）

FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 無匹配 prebuild 時回退 node-gyp——僅 build 階段需要編譯鏈
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV ADAPTER=node
RUN pnpm build && pnpm prune --prod

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY node-shim ./node-shim
COPY migrations ./migrations
COPY server.mjs ./
# 資料 volume：sqlite DB＋媒體檔
VOLUME /app/data
EXPOSE 3000
# 遷移冪套用後起動
CMD ["sh", "-c", "node node-shim/migrate.mjs && node server.mjs"]
