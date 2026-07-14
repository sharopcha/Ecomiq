# TESTING.md — Ecomiq verification playbook

Reference for re-running full, real (not just `tsc`) verification of the
stack without re-discovering the process each time. Every command
here was actually run and produced the output described. Last full pass:
2026-07-08/09.

**Read the "known gotchas" section before doing anything else.** Several of
them cost hours the first time.

---

## Known environment gotchas — READ FIRST

1. **Port 5432 may already be taken** by another project's postgres
   container on this machine (`finance_postgres` at time of writing). Check
   `docker ps | grep 5432` first. If taken, pass `POSTGRES_PORT=5433` (or any
   free port) to every `docker compose` command below — it's a documented
   override var in `docker-compose.yml`, not a code change.

2. **Never bind-mount the real repo into a container to run `npm ci`/`npm
   install`** (e.g. `docker run -v $(pwd):/workspace node:20-alpine npm
   ci`). It silently overwrites the HOST's `node_modules` with
   Linux-native binaries, which then breaks Jest/tsc on a macOS host with
   cryptic errors like `Module ... jest-circus/build/runner.js ... was not
   found`. If this happens: `rm -rf node_modules && npm ci` on the host to
   restore it. (This pattern IS legitimately needed once — to regenerate
   `package-lock.json` so it satisfies `npm ci` inside `node:20-alpine`,
   see Section 0 — just don't do it more than once per debugging session,
   and always `rm -rf node_modules && npm ci` on the host afterward.)

3. **`docker compose up -d` never rebuilds images.** If source changed
   since the images were last built, containers will silently run stale
   code with no warning or error. Always run `docker compose build` (or
   `up -d --build`) before trusting that a running stack reflects current
   source. This bit us badly once — containers ran code ~6 hours older
   than the actual fix commit, with no error at all.

4. **Access tokens are short-lived**: user access tokens 15 min
   (`JWT_ACCESS_TTL`), internal client-credentials tokens 5 min
   (`JWT_INTERNAL_TTL`). Re-fetch if a testing session spans that long —
   symptom is a sudden, unexplained `401 Unauthorized`.

5. **`PULSAR_AUTH_TOKEN`/`REDIS_PASSWORD` in `.env` only matter for the
   prod compose profile** (`docker-compose.prod.yml`). Don't set them
   for a plain dev `docker compose up -d` unless you're intentionally
   testing prod — dev Redis/Pulsar have no auth.

6. **The Pulsar image applies `PULSAR_PREFIX_*` env vars only if the
   `command:` explicitly runs `apply-config-from-env-with-prefix.py`
   first** — it ships with no entrypoint that does this automatically.
   Verify with `docker exec ecomiq-pulsar cat conf/standalone.conf | grep
   authenticationEnabled` — if it says `false` despite the env var being
   set, the `command:` override is missing/broken (see `docker-compose.prod.yml`'s
   `pulsar:` service for the fix already in place).

7. **A fresh Pulsar broker has no "ecomiq" tenant/namespaces** — even
   with a fresh Postgres, you must run `npm run pulsar:provision` (from
   inside the docker network, or with `PULSAR_ADMIN_URL` pointed at a
   reachable admin port) before catalog/inventory can produce/consume.
   Symptom: inventory-service crash-loops with `Failed to create
   consumer: TopicNotFound`.

8. **Postgres's `POSTGRES_MULTIPLE_DATABASES` init script only runs on a
   genuinely fresh volume** (first-ever container start on that volume).
   If you need to re-test "does a fresh volume boot correctly", you must
   `docker compose down -v` first — just `down` (no `-v`) leaves the old
   volume and its already-created databases in place, masking any bug in
   the init script.

---

## Prerequisites (one-time host setup)

```bash
brew install protobuf   # protoc — needed for `npm run contracts:gen`
brew install grpcurl    # optional, for Section 5's gRPC port check
```

Docker Desktop must be running. Everything else (ts-node, jest, etc.) is
already in `package.json`.

---

## Section 0 — Baseline

```bash
git status --short
git log --oneline -10
npm install     # must complete clean
```

If `npm ci` fails inside a Docker build with `Missing: chokidar@4.0.3 from
lock file` (or similar), the lockfile was generated with a different
npm/platform than `node:20-alpine` uses. Fix once:

```bash
docker run --rm -v "$(pwd):/workspace" -w /workspace node:20-alpine npm install
# ⚠️ this is gotcha #2 above — the host node_modules is now Linux-native
rm -rf node_modules && npm ci   # restore host node_modules immediately
```

---

## Section 1 — Static verification

All 15 must exit 0 with no output:

```bash
npx tsc -p apps/gateway/api-gateway/tsconfig.app.json --noEmit
npx tsc -p apps/gateway/api-gateway/tsconfig.spec.json --noEmit
npx tsc -p apps/services/identity/tsconfig.app.json --noEmit
npx tsc -p apps/services/identity/tsconfig.spec.json --noEmit
npx tsc -p apps/services/catalog/tsconfig.app.json --noEmit
npx tsc -p apps/services/catalog/tsconfig.spec.json --noEmit
npx tsc -p apps/services/inventory/tsconfig.app.json --noEmit
npx tsc -p apps/services/inventory/tsconfig.spec.json --noEmit
npx tsc -p libs/shared/auth/tsconfig.lib.json --noEmit
npx tsc -p libs/shared/auth/tsconfig.spec.json --noEmit
npx tsc -p libs/shared/pulsar/tsconfig.lib.json --noEmit
npx tsc -p libs/shared/typeorm/tsconfig.lib.json --noEmit
npx tsc -p libs/shared/typeorm/tsconfig.spec.json --noEmit
npx tsc -p libs/contracts/tsconfig.lib.json --noEmit
npx tsc -p libs/contracts/tsconfig.spec.json --noEmit
```

---

## Section 2 — Jest + contracts:gen

```bash
npx jest
```

Expect: `Test Suites: 15 passed, 15 total` / `Tests: 142 passed, 142
total` (test count grows as more specs are added — suite count of 15
should stay stable across the 7 jest projects unless a new project is
added). The `Warning: Failed to load the ES module ... jest.config.ts`
lines are harmless noise from ts-node/ESM interop, not failures.

**contracts:gen idempotency** (requires `protoc` — see Prerequisites):

```bash
npm run contracts:gen
git status --short libs/contracts/src/generated/   # must be empty
```

If the `shared-auth` project fails to load with `SyntaxError: Unexpected
token 'export'` pointing at `node_modules/jose/...` — `jose` v6+ is
ESM-only and `jwks-rsa` requires it via CJS `require()`. Already fixed in
`libs/shared/auth/jest.config.ts` (`transformIgnorePatterns` + a
`babel-jest` transform for `.js`). If it regresses, that's the fix to
reapply.

---

## Section 3 — Dev stack boot

```bash
docker compose build                        # ALWAYS — see gotcha #3
POSTGRES_PORT=5433 docker compose up -d      # omit override if 5432 is free
docker compose ps                            # all services "healthy"
```

Checks:
- `docker port ecomiq-identity-service` (and catalog/inventory) show
  `3001/3002/3003` published to host (dev only — prod unpublishes these).
- `docker compose ps` shows `mailhog`/`adminer` running with a plain
  `up -d` (no `--profile`).

---

## Section 4 — Gateway proxy correctness

### Register + login (get a token)

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ecomiq.dev","password":"TestPass123!","fullName":"Test User","storeName":"Test Store"}'
# save .accessToken from the response
```

### Catalog CRUD sanity

```bash
TOKEN=<accessToken>
curl -s -X POST http://localhost:3000/api/catalog/products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Product","description":"x","price":9.99,"sku":"TEST-1"}'
```

### Multipart upload byte-integrity check (the specific Step-1 regression case)

Catalog has no real binary-upload endpoint yet (`product-images` only
takes a JSON `fileId` reference — media-service doesn't exist). To prove
the gateway forwards raw multipart bytes unmangled, swap the real service
for a byte-capture stub temporarily:

```bash
# 1. capture server (save as /tmp/capture_server.py)
cat > /tmp/capture_server.py << 'EOF'
import http.server, socketserver
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        open('/data/received.bin', 'wb').write(body)
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(b'{"status":"captured"}')
    def log_message(self, *a): pass
with socketserver.TCPServer(("", 3002), Handler) as httpd:
    httpd.serve_forever()
EOF

# 2. swap catalog-service for the stub, same network + hostname alias
docker stop ecomiq-catalog-service
docker run -d --rm --name capture-catalog --network ecomiq_default \
  --network-alias catalog-service -v /tmp:/data -w /data python:3.11-slim \
  python /data/capture_server.py

# 3. send a real image through the gateway
curl -s -i -X POST http://localhost:3000/api/catalog/products/x/images \
  -H "Authorization: Bearer $TOKEN" -F "file=@/path/to/real-image.png;type=image/png"

# 4. verify byte-for-byte
python3 -c "
data = open('/tmp/received.bin','rb').read()
orig = open('/path/to/real-image.png','rb').read()
print('intact:', orig in data)
"

# 5. restore
docker stop capture-catalog
docker start ecomiq-catalog-service
```

### Edge 401 pre-validation (proves upstream is never even called)

Use the same capture-stub swap, but count requests instead of bytes:

```bash
# garbage/no token -> 401 from gateway, hit counter stays 0
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/catalog/products -H "Authorization: Bearer garbage"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/catalog/products
# valid token -> 200, hit counter becomes 1 (sanity check the stub is reachable at all)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/catalog/products -H "Authorization: Bearer $TOKEN"
```

### 502 / 504

```bash
docker stop ecomiq-catalog-service
time curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/catalog/products -H "Authorization: Bearer $TOKEN"
# -> 502, fast (~0.2s)
docker start ecomiq-catalog-service

# 504: swap catalog for a stub that sleeps 30s before responding, same pattern as above
# expect 504 after PROXY_UPSTREAM_TIMEOUT_MS (default 10s), not a hang
```

### Per-IP independent throttle buckets

⚠️ Don't inject your own `X-Forwarded-For` header pretending to already
be a proxy chain — that simulates an *extra* untrusted hop and gives
wrong results. Use genuinely different source IPs instead — two
long-lived containers on the compose network:

```bash
docker run -d --name client-a --network ecomiq_default curlimages/curl:latest sleep 300
docker run -d --name client-b --network ecomiq_default curlimages/curl:latest sleep 300
docker exec client-a curl -s -i http://api-gateway:3000/api/catalog/products -H "Authorization: Bearer $TOKEN" | grep x-ratelimit-remaining
docker exec client-b curl -s -i http://api-gateway:3000/api/catalog/products -H "Authorization: Bearer $TOKEN" | grep x-ratelimit-remaining
# client-b's remaining count must be a FRESH bucket, not continuing client-a's
docker rm -f client-a client-b
```

### Redis-backed throttle survives gateway restart

Hit a route once for a baseline count, restart, hit again immediately —
do this fast (within the 60s window) or the counter naturally expires
and looks like a false failure:

```bash
docker exec client-a curl -s -i http://api-gateway:3000/api/health | grep x-ratelimit-remaining
docker restart ecomiq-api-gateway
sleep 3
docker exec client-a curl -s -i http://api-gateway:3000/api/health | grep x-ratelimit-remaining
# must continue counting down, not reset to max
```

(Use `/api/health`, not a proxied route — a proxied route's response
headers get overwritten by the upstream service's OWN rate-limit
headers, masking the gateway's own counter.)

---

## Section 5 — Internal auth + gRPC

```bash
# seed (rotate to known secrets for testing — safe, documented mechanism)
ORDER_SERVICE_CLIENT_SECRET=test-secret-1 DEMO_GRPC_CLIENT_SECRET=test-secret-2 \
  npm run identity:service-accounts:seed
# note: this script hangs after printing output instead of exiting — kill it manually:
pkill -f "seed-service-accounts"

# get a client-credentials token
curl -s -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"order-service","client_secret":"test-secret-1","scope":"inventory:reserve"}'

# independently verify the JWT signature (don't trust the server) — Node's built-in crypto:
node -e "
const fs = require('fs'), crypto = require('crypto');
function b64url(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Buffer.from(s,'base64');}
const jwks = JSON.parse(fs.readFileSync('/tmp/jwks.json','utf8')); // curl http://localhost:3001/api/.well-known/jwks.json first
const key = crypto.createPublicKey({ key: jwks.keys[0], format: 'jwk' });
const token = '<paste access_token>';
const [h,p,s] = token.split('.');
const v = crypto.createVerify('RSA-SHA256'); v.update(h+'.'+p); v.end();
console.log('valid:', v.verify(key, b64url(s)));
"

# internal token must be rejected on a normal user route
curl -s -i http://localhost:3000/api/catalog/products -H "Authorization: Bearer <internal-token>"  # -> 401

# full gRPC round trip
DEMO_GRPC_CLIENT_SECRET=test-secret-2 npm run inventory:grpc-demo
# expect: VARIANT_NOT_FOUND, then NOT_FOUND, then UNAUTHENTICATED, then "ALL OK"

# confirm the gRPC port is actually listening
grpcurl -plaintext -import-path libs/contracts/proto -proto inventory/v1/reservation.proto \
  localhost:50051 describe ecomiq.inventory.v1.ReservationService
```

Note: `JWKS_URI` for the gateway's own guard is
`http://identity-service:3001/api/.well-known/jwks.json` (internal); the
gateway does NOT proxy `/api/.well-known/jwks.json` itself (404) — hit
identity-service directly on `localhost:3001` for manual verification.

---

## Section 6 — StoreContextGuard

Legitimate logins always carry `store_id` — there's no normal flow that
produces a user access token without one (multi-store users get a
separate `store_selection_required` token, not a usable access token).
To test the guard's defense-in-depth, forge one using the real RS256
private key:

```bash
node -e "
const { SignJWT, importPKCS8 } = require('jose');
const fs = require('fs'); const { ulid } = require('ulid');
(async () => {
  const key = await importPKCS8(fs.readFileSync('apps/services/identity/keys/private.pem','utf8'), 'RS256');
  const token = await new SignJWT({ sub: 'some-user-id', role: 'owner', perms: ['products:read'], type: 'access' })
    .setProtectedHeader({ alg: 'RS256', kid: 'identity-key-1' })
    .setIssuedAt().setIssuer('ecomiq-identity').setExpirationTime('15m').setJti(ulid())
    .sign(key);
  console.log(token);
})();
"
```

```bash
curl -s -i http://localhost:3000/api/catalog/products -H "Authorization: Bearer <forged-token>"   # -> 401
```

**Pulsar consumer/gRPC non-interference**: create a product via the
normal gateway flow, then check inventory picked it up:

```bash
docker exec ecomiq-postgres psql -U ecomiq -d inventory_db -c \
  "SELECT id, name, sku, store_id FROM catalog_product_snapshot WHERE sku = '<your-test-sku>';"
```
Should show a row within ~2-3 seconds. Re-run the gRPC demo (Section 5)
too — it must still work (proves the guard no-ops for RPC contexts).

---

## Section 7 — Production compose profile

### One-time setup (per fresh clone / rotated secrets)

```bash
npm run identity:keys:generate   # if apps/services/identity/keys/ is empty

mkdir -p infra/pulsar
docker run --rm -v "$(pwd)/infra/pulsar:/keys" apachepulsar/pulsar:4.2.1 \
  bin/pulsar tokens create-secret-key --output /keys/secret.key --base64
docker run --rm -v "$(pwd)/infra/pulsar:/keys" apachepulsar/pulsar:4.2.1 \
  bin/pulsar tokens create --secret-key file:///keys/secret.key --subject admin
# paste the printed token into .env as PULSAR_AUTH_TOKEN=...
# also set REDIS_PASSWORD=<anything> in .env
```

### Boot (always from a clean volume to genuinely test first-boot behavior)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
POSTGRES_PORT=5433 docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps   # all healthy
```

### Provision Pulsar (required on a truly fresh broker — see gotcha #7)

```bash
TOKEN=$(grep PULSAR_AUTH_TOKEN .env | cut -d= -f2)
docker run --rm --network ecomiq_default -v "$(pwd):/workspace" -w /workspace node:20-alpine \
  sh -c "PULSAR_ADMIN_URL=http://pulsar:8080 PULSAR_AUTH_TOKEN=$TOKEN npx ts-node libs/shared/pulsar/src/demo/provision.ts"
# ⚠️ this is gotcha #2's pattern again (bind mount + npm-adjacent) — but ts-node here
# doesn't install anything, so it's safe; if in doubt, `rm -rf node_modules && npm ci`
# on host afterward just in case.
```

If `identity-service`/`inventory-service` need restarting after
provisioning (they may have already failed and be crash-looping):
`docker restart ecomiq-identity-service ecomiq-inventory-service`.

### Checks

```bash
# migrations ran to completion before app services started
docker ps -a --filter "name=migrate" --format "{{.Names}}: {{.Status}}"   # all "Exited (0)"

# no published ports for identity/catalog/inventory/pulsar
for c in ecomiq-identity-service ecomiq-catalog-service ecomiq-inventory-service ecomiq-pulsar; do
  echo "$c: $(docker port $c)"; done   # all empty
docker port ecomiq-api-gateway   # only this one has a mapping

# host cannot reach catalog-service directly; gateway can, by name
curl -s -m 3 -o /dev/null -w "%{http_code}\n" http://localhost:3002/api/health   # connection refused
docker exec ecomiq-api-gateway node -e "fetch('http://catalog-service:3002/api/health').then(r=>r.text()).then(console.log)"

# mailhog/adminer NOT running
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps | grep -iE "mailhog|adminer"   # empty

# Redis auth
docker exec ecomiq-redis redis-cli ping                          # NOAUTH Authentication required.
docker exec ecomiq-redis redis-cli -a "$(grep REDIS_PASSWORD .env | cut -d= -f2)" ping   # PONG

# Pulsar auth
docker exec ecomiq-pulsar bin/pulsar-admin --admin-url http://localhost:8080 brokers healthcheck   # 401
TOKEN=$(grep PULSAR_AUTH_TOKEN .env | cut -d= -f2)
docker exec ecomiq-pulsar bin/pulsar-admin --admin-url http://localhost:8080 \
  --auth-plugin org.apache.pulsar.client.impl.auth.AuthenticationToken --auth-params "token:$TOKEN" \
  brokers healthcheck   # ok

# NODE_ENV + no synchronize noise
for c in ecomiq-identity-service ecomiq-catalog-service ecomiq-inventory-service ecomiq-api-gateway; do
  docker exec $c env | grep NODE_ENV; done   # all "production"
docker logs ecomiq-identity-service 2>&1 | grep -i "query: CREATE TABLE"   # empty
```

### Schema diff (migrations vs. dev `synchronize:true`)

Precise column-level diff, not raw `pg_dump` text diff (formatting noise
makes that unreliable):

```bash
# create throwaway "_sync" databases, run each service locally in dev mode
# (NODE_ENV=development, DB_NAME=..._sync, ports shifted to avoid clashing
# with the real containers) for ~8s to let synchronize:true build the schema,
# then kill it. Repeat per service (identity/catalog/inventory).
# Then, per db pair:
docker exec ecomiq-postgres psql -U ecomiq -d identity_db -t -A -c \
  "SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('migrations') ORDER BY 1;" > /tmp/migrated.txt
docker exec ecomiq-postgres psql -U ecomiq -d identity_db_sync -t -A -c \
  "SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1;" > /tmp/sync.txt
diff /tmp/migrated.txt /tmp/sync.txt   # must be empty (or only known/flagged drift)
```

Known, accepted drift as of last run: `invitation.invited_by` and
`api_key.created_by` are nullable in the migration but NOT NULL under
`synchronize` (entity decorators don't mark them `nullable: true` even
though they have `ON DELETE SET NULL` FKs). Not yet fixed — flagged for
a judgment call, not a mechanical bug.

---

## Section 8 — Security spot-checks

```bash
# no real secret VALUES ever committed (only var names / empty placeholders is fine)
git log -p | grep -iE "PULSAR_AUTH_TOKEN|REDIS_PASSWORD|CLIENT_SECRET" | grep -v '\.env\.example'

# .env / keys / pulsar secret must be gitignored and untracked
git check-ignore -v .env infra/pulsar/secret.key apps/services/identity/keys/private.pem
git ls-files | grep -E "^\.env$|infra/pulsar/secret.key|identity/keys/private.pem"   # must be empty

# private keys never in history at all
git log --all --full-history -- '**/private.pem' '**/secret.key'   # must be empty
```

---

## Section 9 — Order-stack verification

Covers the 3 new services (order/payment/marketing) + inventory integration
+ the checkout/refund/campaign sagas built on top of them. Last full
in-sandbox pass: 2026-07-10 — each piece was individually verified as it
landed; this section is the final, all-at-once re-confirmation.

### In-sandbox (agent-run, all green as of the last pass)

```bash
# 1. tsc — every project config this plan touched (17 configs)
for cfg in \
  apps/services/order/tsconfig.app.json apps/services/order/tsconfig.spec.json \
  apps/services/payment/tsconfig.app.json apps/services/payment/tsconfig.spec.json \
  apps/services/marketing/tsconfig.app.json apps/services/marketing/tsconfig.spec.json \
  apps/services/inventory/tsconfig.app.json apps/services/inventory/tsconfig.spec.json \
  apps/gateway/api-gateway/tsconfig.app.json apps/gateway/api-gateway/tsconfig.spec.json \
  libs/shared/auth/tsconfig.lib.json libs/shared/auth/tsconfig.spec.json \
  libs/shared/typeorm/tsconfig.lib.json libs/shared/typeorm/tsconfig.spec.json \
  libs/shared/pulsar/tsconfig.lib.json \
  libs/contracts/tsconfig.lib.json libs/contracts/tsconfig.spec.json \
; do npx tsc --noEmit -p "$cfg"; done

# 2. migration diff MATCH for all 3 new databases (real docker-postgres
#    throwaway-DB technique, not embedded-postgres — see any verify-migration.ts's
#    own doc comment for the tradeoffs)
npm run order:verify-migration       # MATCH
npm run payment:verify-migration     # MATCH
npm run marketing:verify-migration   # MATCH

# 3. codegen byte-identical
npm run contracts:gen && git status --short libs/contracts/src/generated   # must be empty

# 4. every ts-node demo this plan added (19 scripts) — all print "ALL CHECKS
#    PASSED" (or the grpc-demos' own "ALL OK" line). The 2 gRPC-auth demos
#    need DEMO_GRPC_CLIENT_SECRET exported first (see gotcha below); the
#    webhook demo needs a real --externalRef from a freshly created intent.
npm run payment:intents-demo
npm run payment:refund-demo
npm run payment:webhook-demo -- --externalRef=<ref> --amountMinor=1500   # ref from a fresh POST /payments/intents
DEMO_GRPC_CLIENT_SECRET=<secret> npm run payment:grpc-demo
DEMO_GRPC_CLIENT_SECRET=<secret> npm run marketing:grpc-demo
DEMO_GRPC_CLIENT_SECRET=<secret> npm run inventory:grpc-demo
npm run marketing:discounts-demo
npm run marketing:order-sync-demo
npm run marketing:campaigns-demo
npm run marketing:campaign-fire-demo
npm run marketing:ads-demo
npm run marketing:forms-demo
npm run order:orders-demo
npm run order:returns-demo
npm run order:checkout-saga-demo
npm run order:checkout-demo
npm run order:refunds-demo
npm run order:refund-settlement-demo
npm run inventory:order-sync-demo

# 5. full Jest, every project
npx jest   # 223/223 across 10 projects, last pass
```

**Gotcha #9 (order-stack-specific):** `DEMO_GRPC_CLIENT_SECRET` is only
printed once, the moment `identity:service-accounts:seed` *rotates* it —
an unrotated re-run reports `[exists] ... (secret unchanged — set
DEMO_GRPC_CLIENT_SECRET to rotate)` without printing the value. To recover
a lost/forgotten secret, force a rotation: `DEMO_GRPC_CLIENT_SECRET=<any
new value> npm run identity:service-accounts:seed`. Same applies to
`ORDER_SERVICE_CLIENT_SECRET`.

**Gotcha #10:** `verify-migration.ts`'s down()-check must loop
`undoLastMigration()` until the `migrations` table is empty, not call it
once — a single call only reverts the *most recent* migration. This was
silently wrong from the moment any service accumulated a 2nd migration
file (first caught in marketing, then found again in order/payment) — check
any new `verify-migration.ts` you clone from an older one still has the
loop, not a single call.

**Gotcha #11:** the shared `OutboxMessage.topic` column is
deliberately migrated into each service's own hand-written migration only
once *something in that service* actually needs it — not proactively
everywhere. `synchronize:true` (dev) always has the column regardless, so
this drift is invisible until you actually run that service's
`verify-migration.ts` diff. As of this pass, order/payment/marketing all
have it; catalog/inventory don't yet (harmless — nothing there needs a
topic override — and out of this plan's scope to add).

### User-side (the acceptance bar for this plan)

1. Fresh `docker compose up -d --build` (dev): all services healthy;
   `npm run pulsar:provision` (covers catalog/inventory/orders/payments/
   marketing — closes the `TopicNotFound` gap gotcha #7 describes).
2. `npm run payment:grpc-demo` + `npm run marketing:grpc-demo` +
   `npm run inventory:grpc-demo` all pass (needs `DEMO_GRPC_CLIENT_SECRET`
   exported — see gotcha #9).
3. **The end-to-end checkout:** seed catalog+inventory+order+marketing
   (`catalog:seed` → `inventory:seed` → `order:seed -- --tee-variant=...
   --jacket-variant=...` → `marketing:seed`) → create an order with 2 lines
   + a discount code via gateway REST → `POST /checkout` → poll status:
   discount validated, stock reserved (inventory REST shows `reserved` up)
   → simulate a signed payment webhook → order `paid`, stage
   `preparing_order`, `on_hand` decremented with `sale` movements, discount
   usage recorded (marketing REST). *Already proven live, piecemeal, during
   earlier development passes — this is the all-at-once re-run.*
4. **Failure drills:** checkout with amount ending `99` → payment fails →
   order canceled, reservations released, discount usage absent; let a
   checkout time out → same compensation. *Proven live previously.*
5. **Refund loop:** RMA → approve → inspect → refund approve → mock
   executes → refund `refunded`, order `partially_refunded`, RMA
   `resolved`; `…99` refund → stays `processing` + staff notify command
   visible in `marketing:notify-tail`. *Proven live previously.*
6. Campaign scheduled at now+60s fires and `marketing:notify-tail` prints
   the sends; unauthenticated form submission through the gateway lands a
   `form_submission` row. *Proven live previously.*
7. Jest: `npx jest` green on the user machine (all specs added).

Every item above has already been demonstrated live, individually, at the
step where it was built (see the plan's §9 ledger for each step's specific
proof). Item 1's *fresh, from-an-empty-volume* boot and the full sequential
re-run of items 2-6 back-to-back on that fresh boot is the one thing this
final pass did not repeat in-sandbox (it would require wiping the running
dev stack's Postgres/Pulsar volumes, a destructive action outside what an
agent should do without being asked) — that full fresh-volume run is this
plan's own closing acceptance step, for the user to run and confirm.

---

## Section 10 — Notification verification

Covers the new `notification-service` (in-app bell feed, email/SMS/WhatsApp
dispatch via mock provider ports, transactional outbox + real Pulsar delayed
retries, cross-namespace consumers off marketing/inventory/order) plus the
small additive changes made to those three producers to carry it. Last full
in-sandbox pass: 2026-07-10.

### In-sandbox (agent-run, all green as of the last pass)

```bash
# 1. tsc — every app+spec config this plan touched
for cfg in \
  apps/services/notification/tsconfig.app.json apps/services/notification/tsconfig.spec.json \
  apps/services/marketing/tsconfig.app.json apps/services/marketing/tsconfig.spec.json \
  apps/services/order/tsconfig.app.json apps/services/order/tsconfig.spec.json \
  apps/services/identity/tsconfig.app.json apps/services/identity/tsconfig.spec.json \
  apps/gateway/api-gateway/tsconfig.app.json apps/gateway/api-gateway/tsconfig.spec.json \
  libs/shared/auth/tsconfig.spec.json \
; do npx tsc --noEmit -p "$cfg"; done

# 2. migration diff MATCH (full down()-loop verified) for the new database
npm run notification:verify-migration   # MATCH

# 3. every notification:* ts-node demo — all print "ALL CHECKS PASSED".
#    Stop the live notification-service container first: it holds the same
#    KeyShared Pulsar subscriptions these demos' consumers use, so a running
#    container and a demo script competing for the same subscription means
#    messages sometimes route to whichever has production-scale backoff
#    instead of the demo's fast overrides (see gotcha #16).
docker stop ecomiq-notification-service
npm run notification:templates-demo
npm run notification:feed-demo
npm run notification:dispatch-demo
npm run notification:commands-demo
npm run notification:webhook-demo
npm run notification:stock-low-demo
npm run notification:return-approved-demo
docker start ecomiq-notification-service

# 4. full Jest, every project (this sandbox CAN run Jest — see gotcha #17)
npx jest   # 265/265 across 11 projects, last pass

# 5. pre-existing producer demos re-run to prove no regression from the
#    additive payload/auth changes this plan made to them
npm run marketing:campaign-fire-demo
npm run order:refund-settlement-demo

# 6. prod-compose config check
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

**The `.fail` deterministic-failure trigger:** any recipient whose local
part ends in `.fail` (email `ada.fail@example.com`, phone
`+15550000000.fail`) makes every mock provider (`MockEmailProvider`,
`MockSmsProvider`, `MockWhatsAppProvider`) return `{ ok: false }`
deterministically — same trick as payment's amount-ending-`99`. This is the
only way to exercise `DispatchService`'s retry/DLQ path: a failing send
walks `pending` → (real Pulsar delayed redelivery, exponential backoff +
jitter, see `backoff.util.ts`) → `dead` after exhausting attempts, emitting
`notify.message.retry`/`notify.message.failed` outbox events along the way.

**The webhook signing recipe:** `MockEmailProvider` verifies inbound
webhooks with HMAC-SHA256 over the *raw request bytes* (not the parsed
JSON), keyed by `NOTIFICATION_WEBHOOK_SECRET` (defaults to
`dev-mock-webhook-secret`), sent in the `x-mock-email-signature` header —
same shape as payment's `MOCK_SIGNATURE_HEADER`/`MOCK_WEBHOOK_SECRET`. To
simulate a provider callback by hand:

```bash
BODY='{"type":"bounced","providerMessageId":"mock_email_<id>"}'
SIG=$(node -e "console.log(require('crypto').createHmac('sha256','dev-mock-webhook-secret').update(process.argv[1]).digest('hex'))" "$BODY")
curl -s -X POST http://localhost:3000/api/notifications/webhooks/email \
  -H "content-type: application/json" -H "x-mock-email-signature: $SIG" \
  -d "$BODY"
```

`NestFactory.create()` needs `rawBody: true` for this route's
`req.rawBody` to exist at all — set once in notification-service's
`main.ts`, same as payment's webhook route.

**Gotcha #12:** demo scripts built with `NestFactory.create()` +
`connectMicroservice()` + `startAllMicroservices()` never actually start
`onModuleInit` lifecycle hooks — including `OutboxRelayService` — unless
followed by `.listen()` or an explicit `await app.init()`.
`startAllMicroservices()` alone is not enough. Symptom: outbox rows sit
with `processed_at: NULL` forever, silently, with no error — easy to miss
if assertions only check the DB row was created, not that it was relayed.
Every notification demo now calls `await app.init()` before starting
microservices; clone from one of those, not an older demo missing this line.

**Gotcha #13:** a corrupted Pulsar BookKeeper ledger (symptom: `Error
while recovering ledger error code: -10` in `docker logs ecomiq-pulsar`,
topic creation/consumption hangs or fails repo-wide, not just for one
service) does not self-heal on container restart — the corruption lives in
the `ecomiq_pulsar_data` volume, not the container. Fix requires wiping
and recreating the volume (destructive — confirm with the user first):
`docker compose stop pulsar && docker compose rm -f pulsar && docker
volume rm ecomiq_ecomiq_pulsar_data && docker compose up -d pulsar && npm
run pulsar:provision`, then restart every service container that holds a
live Pulsar connection.

**Gotcha #14:** `InternalAuthGuard` (used to accept internal
client-credentials tokens on an otherwise-`@Public()` route, e.g.
marketing's `recordSendEvent`) needs `InternalTokenVerifierService` in its
*own* module's DI scope — importing `AuthSharedModule` into `AppModule`
does not make it available to a feature module that never imports it
itself. Symptom: `UnknownDependenciesException` naming
`InternalAuthGuard`/`InternalTokenVerifierService` at boot. Fix: add
`AuthSharedModule.forRootAsync({...})` directly to the *feature* module's
own `imports` (same pattern marketing's `DiscountsModule` already used for
`GrpcInternalAuthGuard`).

**Gotcha #15:** container `environment:` blocks in `docker-compose.yml`
do not automatically inherit the root `.env` file's variables — only the
vars a compose service block explicitly lists get into that container.
Symptom: a service-to-service HTTP call (e.g.
`WebhookDispatchService`→marketing's `recordSendEvent`, or the internal
token fetch to identity) resolves `MARKETING_SERVICE_URL`/
`IDENTITY_TOKEN_URL` to their code defaults (`localhost`, meaning the
calling container itself) and fails with `fetch failed`, even though
`.env` "clearly" has the right value. Fix: add the var explicitly to that
service's block in `docker-compose.yml`.

**Gotcha #16:** a Docker container and a `ts-node` demo script both
connecting to the *same* Pulsar subscription name compete for delivery —
`KeyShared` (and most other subscription types) hands each message to
exactly one connected consumer, chosen by the broker, not by which
consumer "should" get it. Running a demo against a live topic while that
service's own container is also up means messages can route to the
container (with production-scale timers/backoff) instead of the demo
(with fast test overrides), making the demo hang or time out
non-deterministically. Fix: `docker stop <service-container>` before
running any demo that drives a live consumer, `docker start` after.

**Gotcha #17:** the plan's own draft text assumed "sandbox can't run
Jest" — that assumption was stale. Tested directly during Step 11: both
`npx jest --selectProjects notification-service` and the full repo-wide
`npx jest` run cleanly in this sandbox (36 suites/265 tests, all green).
Don't propagate an old environment assumption into a new plan without
re-testing it first.

### User-side (the acceptance bar for this plan)

1. Fresh `docker compose up -d --build`: all services healthy, including
   `notification-migrate` (runs in the base compose file, not just prod —
   `notification-service`'s `synchronize` is unconditionally `false`, dev
   included) and `notification-service` itself.
2. Seed chain: `catalog:seed` → `inventory:seed` → `order:seed` →
   `marketing:seed` → `notification:seed`.
3. **Campaign loop:** fire a campaign (`marketing:campaign-fire-demo` or
   a real scheduled campaign) → notification-service's email logs show the
   sends → a signed `POST /api/notifications/webhooks/email` `opened`
   event → marketing's `campaign.stats.opened` count increments (verify via
   marketing REST). *Proven live in Steps 7/8.*
4. **Refund loop:** trigger a refund that fails (recipient ending
   `.fail`, or the order-stack's amount-ending-`99` failure path) → a
   `refund_failed_staff_alert` in-app notification appears in the bell
   feed (`GET /api/notifications`, `unread-count` increments). *Proven
   live in Step 7.*
5. **Stock-low loop:** cross a configured stock threshold in inventory
   (audit stock down past the alert's `lower_than` value) → real
   `inventory.stock.low` event → staff email + staff SMS + in-app
   broadcast all fan out from the same event. *Proven live in Step 9.*
6. `npx jest` green on the user machine (all specs added, 265/265 as of
   this pass).

Every item above has already been demonstrated live, individually, at the
step where it was built (see the plan's §9 ledger for each step's specific
proof). The *fresh, from-an-empty-volume* boot + full sequential re-run of
items 3-5 back-to-back on that fresh boot is this plan's own closing
acceptance step, same reasoning as order-stack's §9 — an agent should not
unilaterally wipe a running dev stack's volumes without being asked.

---

## Section 11 — Shipping verification

Covers the new `shipping-service` (labels/carrier mock, shipment lifecycle
+ event timeline, fulfillment + tracking numbers, delay detection, bulk
pickups, a shipment-notification composer, a public tracking API) plus the
cross-service reactions built into notification-service and order-service,
and the additive changes made to order-service's own checkout-saga payload
to carry it. Last full in-sandbox pass: 2026-07-11.

### In-sandbox (agent-run, all green as of the last pass)

```bash
# 1. tsc — every app+spec config this plan touched
for cfg in \
  apps/services/shipping/tsconfig.app.json apps/services/shipping/tsconfig.spec.json \
  apps/services/order/tsconfig.app.json apps/services/order/tsconfig.spec.json \
  apps/services/notification/tsconfig.app.json apps/services/notification/tsconfig.spec.json \
  apps/gateway/api-gateway/tsconfig.app.json apps/gateway/api-gateway/tsconfig.spec.json \
  apps/services/identity/tsconfig.app.json apps/services/identity/tsconfig.spec.json \
; do npx tsc --noEmit -p "$cfg"; done
# repo-wide sweep also re-ran clean across every other service's own
# tsconfig (catalog, inventory, payment, marketing, libs/shared/*) —
# nothing outside the five above was touched by this plan.

# 2. migration diff MATCH (full down()-loop verified) for both new/changed databases
npm run shipping:verify-migration   # MATCH
npm run order:verify-migration      # MATCH (fulfillment_rollup + order_line.fulfilled_qty)

# 3. every shipping:* ts-node demo — all print "ALL CHECKS PASSED".
#    Stop the live shipping-service container first: same KeyShared
#    subscription-contention reasoning as gotcha #16.
docker stop ecomiq-shipping-service
npm run shipping:labels-demo
npm run shipping:label-purchase-demo
npm run shipping:shipments-demo
npm run shipping:auto-draft-demo
npm run shipping:fulfillment-demo
npm run shipping:tracking-webhook-demo
npm run shipping:delay-demo
npm run shipping:pickups-demo
npm run shipping:shipment-notify-demo
npm run shipping:tracking-page-demo
docker start ecomiq-shipping-service

# 4. order-service's own cross-service rollup demo (fulfillment/stage)
npm run order:shipping-rollup-demo

# 5. full Jest, every project
npx jest   # 45/45 suites, 323/323 tests, last pass

# 6. pre-existing demos re-run to prove no regression from the additive
#    payload/rollup changes this plan made to order-service and
#    notification-service
docker stop ecomiq-order-service
npm run order:checkout-saga-demo
npm run order:returns-demo
npm run order:refund-settlement-demo
docker start ecomiq-order-service

docker stop ecomiq-notification-service
npm run notification:shipping-delay-demo
docker start ecomiq-notification-service

# 7. prod-compose config check
REDIS_PASSWORD=<value> PULSAR_AUTH_TOKEN=<value> \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

**The postal-99 deterministic-failure trigger:** a `destinationAddress`
whose `postalCode` ends in `99` makes `MockCarrierProvider.purchaseLabel()`
reject deterministically — same trick as payment's amount-ending-`99` and
notification's `.fail`-suffix recipient. This is the only way to exercise
the label-purchase failure path (`shipping.label.purchase_failed`, the
label staying `draft`).

**The tracking webhook HMAC recipe:** `TrackingWebhookController` verifies
`x-mock-tracking-signature` as `HMAC-SHA256(rawBody, SHIPPING_WEBHOOK_SECRET)`
(defaults to `dev-mock-webhook-secret`), same shape as payment/
notification's own mock-webhook signing:

```bash
BODY='{"eventId":"evt_1","trackingNumber":"TRK-123","kind":"picked_up"}'
SIG=$(node -e "console.log(require('crypto').createHmac('sha256','dev-mock-webhook-secret').update(process.argv[1]).digest('hex'))" "$BODY")
curl -s -X POST http://localhost:3000/api/shipping/webhooks/tracking \
  -H "content-type: application/json" -H "x-mock-tracking-signature: $SIG" \
  -d "$BODY"
```

`NestFactory.create()` needs `rawBody: true` for this route's `req.rawBody`
to exist — set in shipping-service's `main.ts`, same as payment/
notification's webhook routes.

**Gotcha #18:** `NestFactory.createApplicationContext(AppModule)` + a
module providing a raw `ioredis` client with no `OnModuleDestroy` hook
means `app.close()` never actually terminates the process — the open
socket keeps Node's event loop alive indefinitely even though every
assertion in the script already ran and passed. Symptom: the script's own
log output shows `ALL CHECKS PASSED`, but the process (and any shell
pipeline reading its stdout) appears to hang for minutes with an idle,
non-spinning event loop (confirm via `sample <pid> 2` on macOS — the call
graph sits in `uv__io_poll`/`kevent`, not user code). Fix: give the client's
module a small provider implementing `OnModuleDestroy` that calls
`.quit()` — `app.close()` triggers module-destroy hooks automatically, no
`enableShutdownHooks()` needed. Found running `shipping:seed`
(`RedisModule`, added in shipping's own Step 13); check any future
raw-Redis-client module against this before assuming a hang is a real bug
elsewhere.

**Gotcha #19:** a service's Redis client reading `REDIS_PASSWORD` doesn't
automatically get it in the prod compose profile just because another
service's block already sets it — `docker-compose.prod.yml`'s
per-container `environment:` maps are independent (same class of gap as
gotcha #15). Found via direct comparison: identity-service's own prod
override already had this exact `REDIS_PASSWORD` fix documented (from
hitting the live "NOAUTH Authentication required" error), but
shipping-service's prod block — freshly Redis-enabled by this plan's Step
13 — never got the equivalent line. Fixed by copying the same
`REDIS_PASSWORD: '${REDIS_PASSWORD:?...}'` override into
shipping-service's block. Any newly Redis-enabled service needs this
checked explicitly; it will not surface as a build/tsc/lint failure, only
as a silent runtime auth error once the prod Redis actually requires a
password.

### User-side (the acceptance bar for this plan)

1. Fresh `docker compose up -d --build`: all services healthy, including
   `shipping-migrate` (dev included — `synchronize` is unconditionally
   `false`) and `shipping-service` itself.
2. Seed chain: `catalog:seed` → `inventory:seed` → `order:seed` →
   `marketing:seed` → `notification:seed` → `shipping:seed`.
3. **Order-to-delivery loop:** checkout a real order through the gateway →
   the checkout saga completes → a draft shipment auto-creates
   (`shipping.order-events`, *proven live in Step 6*) → purchase a label
   (*Step 4*) → fulfill the order's lines (*Step 7*, links
   `shipment.fulfillmentId` and rolls `order.fulfillmentStatus` forward via
   order-service's rollup consumer, *Step 12*) → walk a signed carrier
   webhook sequence to `arrived` (*Step 8*) → order's `stage` advances to
   `delivered` via the same rollup consumer (*Step 12*).
4. **Delay loop:** transition a shipment to `in_progress` with a
   near-future `expectedArrivalAt` → the real delayed Pulsar message fires
   → `isDelayed: true` → notification-service sends a real delay email
   (*Steps 9 and 11*).
5. **Pickup-reminder loop:** bulk-schedule a pickup → its reminder-check
   delayed message fires → a `notify.send` `pickup_reminder` command fans
   out to a staff email + an in-app bell-feed broadcast (*Step 10 → 11*).
6. **Public tracking loop:** an unauthenticated `curl
   /api/shipping/track/:storeId/:displayId` returns the shipment's status/
   stage/timeline with no PII beyond the destination city; firing 30+
   requests in a burst gets throttled (*Step 13*).
7. `npx jest` green on the user machine (323/323 across 12 projects, as of
   this pass).

Every item above has already been demonstrated live, individually, at the
step where it was built (see `ECOMIQ-SHIPPING-PLAN.md`'s §9 ledger for each
step's specific proof). The *fresh, from-an-empty-volume* boot + full
sequential re-run of items 3-6 back-to-back on that fresh boot is this
plan's own closing acceptance step, same reasoning as the notification
plan's own §10 — an agent should not unilaterally wipe a running dev
stack's volumes without being asked.

---

## Section 12 — CRM verification

Covers the new `crm-service` (customers + `CST-<n>` display ids, order
rollups, reviews + review-requests, customer auth with its own RS256
keypair/JWKS, wishlist, loyalty, referrals, rule-based segments) plus the
cross-service reactions built into catalog-service (rating rollups),
marketing-service (segment recipients), and notification-service
(`welcome`/`review_request` templates). Last full in-sandbox pass:
2026-07-11.

### In-sandbox (agent-run, all green as of the last pass)

```bash
# 1. tsc — every app+spec config this plan touched
for cfg in \
  apps/services/crm/tsconfig.app.json apps/services/crm/tsconfig.spec.json \
  apps/services/catalog/tsconfig.app.json \
  apps/services/marketing/tsconfig.app.json \
  apps/services/notification/tsconfig.app.json \
  libs/shared/auth/tsconfig.spec.json \
; do npx tsc --noEmit -p "$cfg"; done
# repo-wide sweep also re-ran clean across every other service's own
# tsconfig (identity, inventory, order, payment, shipping, gateway) —
# nothing outside the five above was touched by this plan.

# 2. migration diff MATCH (full down()-loop verified) for every changed database
npm run crm:verify-migration            # MATCH
npm run marketing:verify-migration      # MATCH (segment_snapshot + campaign.segment_id)
npm run notification:verify-migration   # MATCH (welcome/review_request enum labels)

# 3. every crm:* ts-node demo — all print "ALL CHECKS PASSED"
npm run crm:customers-demo
npm run crm:rollup-demo
npm run crm:reviews-demo
npm run crm:review-requests-demo
npm run crm:customer-auth-demo
npm run crm:auth-demo
npm run crm:wishlist-demo
npm run crm:loyalty-demo
npm run crm:referrals-demo
npm run crm:segments-demo

# 4. the three cross-service demos proving Steps 7/14/15's consumers
npm run catalog:review-sync-demo
npm run marketing:segment-sync-demo
npm run notification:crm-templates-demo

# 5. full Jest, every project (Jest genuinely executes in this sandbox —
#    corrects an assumption carried over from earlier plans)
npx jest   # 49/49 suites, 351/351 tests, last pass

# 6. seed data, for a human to inspect via the gateway afterward
npm run crm:seed
```

**A real gap worth being honest about, not glossing over:** the plan's own
wording ("welcome email in MailHog") doesn't hold literally.
`notification-service`'s `EmailProviderPort` is a **logging-only mock**
(`[EmailProviderPort:mock] SENT to=... subject=...` in stdout) — it has
never been wired to a real SMTP transport. Only **identity-service**
(`mail.service.ts`, `nodemailer` + `SMTP_HOST=mailhog`) actually delivers
mail into MailHog's inbox (verify/reset/invite emails). crm's `welcome`/
`review_request` commands are real, dispatched, and rendered — but their
"delivery" is the same mock stub every other `notify.send` command in this
repo already goes through (campaign, refund, shipment, pickup reminder);
this is a pre-existing, cross-cutting limitation of notification-service
itself, not something Step 15 introduced or could fix in scope. Verify a
welcome/review-request send by tailing `notification-service`'s logs for
the `EmailProviderPort:mock` line, or by querying `send_log` directly —
not by checking MailHog's web UI at `http://localhost:8025`, which will
never show it.

### User-side (the acceptance bar for this plan)

1. Fresh `docker compose up -d --build`: all services healthy, including
   `crm-migrate`/`crm-service` (dev included — `synchronize` is
   unconditionally `false`, same as shipping/notification).
2. Seed chain: `catalog:seed` → `inventory:seed` → `order:seed` →
   `marketing:seed` → `notification:seed` → `shipping:seed` → `crm:seed`.
3. **Register-to-loyalty loop:** `POST /api/crm/auth/register` (with a
   `storeId`, email, password, fullName) → a real access+refresh token
   pair issues (*Step 8*) → tail notification-service's logs for the
   `welcome` template's mock send (*Step 15*, see the MailHog caveat
   above) → place a real order for that customer through order-service's
   checkout saga → crm's `order-events::crm-service` subscription rolls up
   `total_orders`/`total_spent_minor` (*Step 4*) and accrues loyalty points
   + recomputes tier (*Step 11*) in the same handler pass.
4. **Review loop:** create a `review_request` for that order (*Step 6*,
   tail notification for the `review_request` mock send) →
   `POST /api/crm/storefront/reviews` as that customer, gated on the open
   request (*Step 9*) → publish the review as staff
   (`POST /api/crm/reviews/:id/publish`) → catalog-service's
   `review-events::catalog-service` consumer recomputes the product's
   `rating_avg`/`rating_count` (*Step 7*).
5. **Referral loop:** generate a referral code
   (`GET /api/crm/referrals` after `getOrCreateCode` fires lazily on
   storefront access, *Step 12*) → register a second customer with that
   code (`pending` referral row) → that referee's first order completes
   the referral and awards the referrer loyalty points via the shared
   `awardWithRefId` path.
6. **Segment-to-marketing loop:** create a segment
   (`POST /api/crm/segments`, a rule over `total_spent_minor`/
   `loyalty_tier`) → evaluate it (`POST /api/crm/segments/:id/evaluate`,
   *Step 13*) → marketing-service's `segment-events::marketing-service`
   consumer upserts `segment_snapshot` (*Step 14*) → create a campaign with
   that `segmentId` and fire it — recipients resolve from the snapshot,
   not the loose `audience.emails` list.
7. `npx jest` green on the user machine (351/351 across 13 projects, as of
   this pass).

Every item above has already been demonstrated live, individually, at the
step where it was built (see this plan's own §9 ledger for each step's
specific proof). The *fresh, from-an-empty-volume* boot + full sequential
re-run of items 3-6 back-to-back on that fresh boot is this plan's own
closing acceptance step, same reasoning as the notification/shipping
plans' own closing sections — an agent should not unilaterally wipe a
running dev stack's volumes without being asked.

---

## 13. Storefront E2E Validation

With the Next.js Storefront complete, the entire stack can now be exercised end-to-end through the web interface.

1. **Boot**: `docker compose up -d`
2. **Access Storefront**: Open `http://localhost:4300` in a browser.
3. **Register/Login**: Navigate to `/register`. Provide a valid email and password.
4. **Browse Catalog**: Navigate to `/products`. Observe the grid layout and verify that filtering (by category/vendor) and pagination work.
5. **Product Detail**: Click on a product. Verify images, pricing, and variant selection (if applicable).
6. **Cart & Checkout**:
   - Add product to cart. The cart drawer should open.
   - Proceed to `/checkout`.
   - Enter shipping address details.
   - Select a mock shipping method and proceed to payment.
   - Submit the order.
7. **Order Confirmation**: Verify redirection to `/checkout/confirmation` with the order ID.
8. **Account Management**:
   - Navigate to `/account`.
   - View the generated order under `/account/orders`.
   - Update your profile name under `/account/profile`.
   - Add an item to the wishlist and verify it appears under `/account/wishlist`.

## Cleanup after a full run

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down   # keep volumes for next time, or -v for a truly clean slate
docker exec ecomiq-postgres psql -U ecomiq -c "DROP DATABASE IF EXISTS identity_db_sync;"   # if schema-diff throwaways were left over
docker rm -f capture-catalog client-a client-b 2>/dev/null   # any leftover test containers
```
