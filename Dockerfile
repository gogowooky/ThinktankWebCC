# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build
RUN npm run build:server

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy build artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json ./package.json

# /api/system/search-tags (systemRoutes.ts) がリクエスト毎にこのファイルを読むため、
# docs/ 全体は含めず必要な1ファイルだけをコピーする
COPY --from=builder /app/docs/DefaultSearchTag.md ./docs/DefaultSearchTag.md

# AI Chat のシステムプロンプト定義（chatRoutes.ts がリクエスト毎に読む。
# 無くても空文字で動くため気付きにくいが、公開環境ではプロンプトが常に欠落していた）
COPY --from=builder /app/.thinktank/thinktank.md ./.thinktank/thinktank.md

# Expose port
EXPOSE 8080

# Start server (use compiled TypeScript server)
CMD ["node", "dist-server/index.js"]
