# Build context is the repo root (Nx needs the whole workspace graph to
# build one project) — see docker-compose.yml's `build.context: .` for this
# service. Run via docker-compose, not `docker build` from this directory.

# ---- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

# python3/make/g++: bcrypt falls back to compiling its native addon from
# source when no prebuilt binary matches this exact node/alpine(musl)/arch
# combination — cheap insurance, only paid once, in this stage.
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

RUN npx nx build identity-service

# ---- runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /workspace

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/apps/services/identity ./dist/apps/services/identity
COPY --from=build /workspace/package.json ./package.json
# Drop devDependencies (webpack, nx, ts-jest, the Angular toolchain, ...) —
# safe here because the build step above already ran; nothing at runtime
# needs them, since NxAppWebpackPlugin bundles `@temp-nx/*` libs directly
# into the compiled output rather than leaving them as node_modules externals.
# Pruned in *this* stage, not `build` — docker-compose.prod.yml's *-migrate
# services target `build` directly to get devDependencies (ts-node, the
# typeorm CLI) for running migrations; pruning inside `build` itself would
# strip those before that stage is ever referenced, defeating the point.
RUN npm prune --omit=dev

# JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH are resolved relative to
# process.cwd() at runtime (see KeyService + generate-keys.ts) — WORKDIR here
# matches the repo-root-relative path so the same env values work whether
# running via `nx serve` on the host or in this container, as long as
# ./apps/services/identity/keys is bind-mounted (see docker-compose.yml).
EXPOSE 3001
CMD ["node", "dist/apps/services/identity/main.js"]
