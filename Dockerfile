# Frontend Dockerfile for FocusFlow (Vite + React + TypeScript)
FROM node:20-alpine AS build

WORKDIR /app

# Build-time argument: the URL the user's browser will use to reach the backend.
# Must be set at build time because Vite embeds it into the bundle.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Build the frontend assets (VITE_API_URL is embedded here)
RUN npm run build

# ─── Production serving stage ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install the lightweight static file server
RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
