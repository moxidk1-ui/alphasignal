FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/indicators/package.json packages/indicators/package.json
COPY packages/algo-engine/package.json packages/algo-engine/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/indicators packages/indicators
COPY packages/algo-engine packages/algo-engine
COPY packages/queue packages/queue
COPY apps/api apps/api

RUN pnpm --filter @alphasignal/db prisma:generate
RUN pnpm --filter @alphasignal/shared build
RUN pnpm --filter @alphasignal/db build
RUN pnpm --filter @alphasignal/indicators build
RUN pnpm --filter @alphasignal/algo-engine build
RUN pnpm --filter @alphasignal/queue build
RUN pnpm --filter @alphasignal/api build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat openssl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/indicators/package.json ./packages/indicators/package.json
COPY --from=build /app/packages/indicators/dist ./packages/indicators/dist
COPY --from=build /app/packages/indicators/node_modules ./packages/indicators/node_modules
COPY --from=build /app/packages/algo-engine/package.json ./packages/algo-engine/package.json
COPY --from=build /app/packages/algo-engine/dist ./packages/algo-engine/dist
COPY --from=build /app/packages/algo-engine/node_modules ./packages/algo-engine/node_modules
COPY --from=build /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=build /app/packages/queue/dist ./packages/queue/dist
COPY --from=build /app/packages/queue/node_modules ./packages/queue/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
