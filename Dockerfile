# Multi-stage build for PFM India

# Backend
FROM node:20-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/ .
EXPOSE 3001
CMD ["node", "src/index.js"]

# Frontend build
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=backend /app/backend ./backend
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Serve frontend with backend
EXPOSE 3001
WORKDIR /app/backend
CMD ["node", "src/index.js"]
