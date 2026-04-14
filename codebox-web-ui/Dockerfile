# Stage 1: Dependencies
FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Stage 2: Build
FROM deps AS builder
COPY . .
RUN pnpm build

# Stage 3: Runtime
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3737
CMD ["node", ".output/server/index.mjs"]
