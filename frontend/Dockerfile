# syntax=docker/dockerfile:1

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Cache npm install separately from source
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

COPY . .

# Build args become VITE_ env vars at build time
ARG VITE_API_URL=http://localhost:8080/api/v1
ARG VITE_WS_URL=ws://localhost:8080/ws
ARG VITE_TURNSTILE_SITE_KEY=""
ARG VITE_FIREBASE_VAPID_KEY=""

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY} \
    VITE_FIREBASE_VAPID_KEY=${VITE_FIREBASE_VAPID_KEY}

RUN npm run build

# ─── Stage 2: Runtime (nginx) ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /build/dist /usr/share/nginx/html

# Nginx config: serve SPA with HTML5 history API fallback + gzip + security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1
