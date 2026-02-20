FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY --from=build /app/package.json ./
RUN npm install --omit=dev --workspace=packages/server --workspace=packages/shared
EXPOSE 3001
ENV PORT=3001
CMD ["node", "packages/server/dist/serve.js"]
