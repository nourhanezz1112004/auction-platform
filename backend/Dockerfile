FROM node:20-alpine

RUN apk add --no-cache openssl

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json   ./packages/shared-types/package.json
COPY packages/shared-events/package.json  ./packages/shared-events/package.json
COPY packages/shared-utils/package.json   ./packages/shared-utils/package.json
COPY backend/package.json                 ./backend/package.json
COPY apps/web/package.json                ./apps/web/package.json

RUN pnpm install --ignore-scripts=false

COPY packages/ ./packages/
COPY backend/  ./backend/

WORKDIR /app/backend

RUN npx prisma generate

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]