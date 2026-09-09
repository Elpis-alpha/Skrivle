# Skrivle API. Only the back-end is containerised — Postgres is a local install
# in dev and an external managed database in prod, both via DATABASE_URL.

FROM node:22-alpine AS build
WORKDIR /app
# Prisma's engines dynamically link libssl; the base image doesn't expose it
# where they look, and `prisma generate` probes for it too.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# libssl for the Prisma query + schema (migration) engines.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
# `prisma` is a runtime dependency (not omitted) so the entrypoint can run
# `prisma migrate deploy`; its postinstall fetches the musl schema engine.
RUN npm ci --omit=dev
# Generated Prisma client + query engine from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Hand-authored API spec, read at runtime by src/http/openapi.ts.
COPY --from=build /app/openapi.yaml ./openapi.yaml
# Applies pending migrations before the server starts — see the script.
COPY docker-entrypoint.sh ./
EXPOSE 4000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
