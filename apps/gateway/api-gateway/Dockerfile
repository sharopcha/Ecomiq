# Build context is the repo root (Nx needs the whole workspace graph to
# build one project) — see docker-compose.yml's `build.context: .` for this
# service. Run via docker-compose, not `docker build` from this directory.

# ---- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

# No native deps here (no bcrypt/pulsar-client on this service), so unlike
# identity/catalog's Dockerfiles, no build-tooling fallback is needed.
COPY package.json package-lock.json nx.json tsconfig.base.json eslint.config.mjs ./
# npm ci (not npm install) is the repo convention everywhere for exact
# lockfile reproducibility, but it currently false-positives on this
# workspace: a byte-identical clean reinstall reproduces the exact same
# package-lock.json, yet npm ci's stricter tree validator still rejects it
# over a nested chokidar/readdirp copy (sass's ^4.0.0 pin vs the hoisted
# chokidar@5.0.0 from @angular/compiler-cli) that npm install resolves
# fine. npm install is the workaround until the underlying npm-ci-vs-
# npm-install discrepancy is root-caused and fixed.
RUN npm install

COPY apps ./apps
COPY libs ./libs

RUN npx nx build api-gateway
RUN npm prune --omit=dev

# ---- runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /workspace

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/gateway/api-gateway ./dist/apps/gateway/api-gateway
COPY --from=build /workspace/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/apps/gateway/api-gateway/main.js"]
