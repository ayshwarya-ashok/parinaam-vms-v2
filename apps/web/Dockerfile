# =============================================================================
# Parinaam VMS web — Vite dev server in development, static nginx in production
# =============================================================================
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
