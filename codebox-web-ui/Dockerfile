# Stage 1: Build
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Runtime
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3737
CMD ["node", ".output/server/index.mjs"]
