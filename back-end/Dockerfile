# Skrivle API. Only the back-end is containerised — Postgres is a local install
# in dev and an external managed database in prod, both via DATABASE_URL.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Generated Prisma client + query engine from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Hand-authored API spec, read at runtime by src/http/openapi.ts.
COPY --from=build /app/openapi.yaml ./openapi.yaml
EXPOSE 4000
CMD ["node", "dist/index.js"]
