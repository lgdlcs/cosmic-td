FROM node:22-alpine AS build
WORKDIR /app
COPY ../../package*.json ./
COPY ../../packages/shared ./packages/shared
COPY ../../packages/client ./packages/client
RUN npm ci
RUN npx vite build --config packages/client/vite.config.ts

FROM nginx:alpine
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
EXPOSE 8080
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/default.conf
