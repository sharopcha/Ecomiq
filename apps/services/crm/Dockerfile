# Build context is the repo root (Nx needs the whole workspace graph to
# build one project) — see docker-compose.yml's `build.context: .` for this
# service. Run via docker-compose, not `docker build` from this directory.
# Byte-for-byte structural copy of shipping-service's Dockerfile.

# ---- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

# python3/make/g++: pulsar-client ships prebuilt binaries per platform/libc/arch
# (node-pre-gyp) but falls back to compiling the Apache Pulsar C++ client from
# source if none matches this exact combination — crm-service uses
# pulsar-client for producing (PulsarModule) and, once the order-events
# consumer lands, for consuming too, same as every other service.
RUN apk add --no-cache python3 make g++

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

RUN npx nx build crm-service

# ---- runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /workspace

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/services/crm ./dist/apps/services/crm
COPY --from=build /workspace/package.json ./package.json
# Pruned here, not in `build` — docker-compose.prod.yml's *-migrate services
# target `build` directly to get devDependencies (ts-node, the typeorm CLI)
# for running migrations; pruning inside `build` itself would strip those
# before that stage is ever referenced, defeating the whole point.
RUN npm prune --omit=dev

EXPOSE 3009
CMD ["node", "dist/apps/services/crm/main.js"]
