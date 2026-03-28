FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/medicine.db
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:3000/api/medicines/stats || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
