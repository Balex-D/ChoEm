FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server/ ./server/
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/build ./server/build
COPY --chown=node:node package*.json ./
COPY --chown=node:node server/src/db/migrations ./server/src/db/migrations
COPY --chown=node:node dist ./dist
USER node
EXPOSE 8080
CMD ["sh", "-c", "node server/build/db/migrate.js && node server/build/index.js"]
