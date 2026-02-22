FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npx tsc --project packages/shared/tsconfig.json
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "packages/server/src/index.ts"]
