FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci

FROM deps AS build

COPY backend ./backend
COPY frontend ./frontend

RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci --omit=dev --workspace backend

FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./frontend/dist

RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/medicine.db
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
