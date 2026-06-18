# ──────────────────────────────────────────────────────────────────────────
# HedgeFund AI brochure - static site for Railway (or any container host).
#
# Two stages: build the Vite bundle with Node, then serve the static dist/
# with nginx. Railway injects $PORT at runtime; the entrypoint rewrites the
# nginx listen directive to match before starting.
# ──────────────────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# nginx:alpine's entrypoint renders /etc/nginx/templates/*.template through
# envsubst (substituting $PORT) into /etc/nginx/conf.d/ before launch.
ENV PORT=8080
EXPOSE 8080
