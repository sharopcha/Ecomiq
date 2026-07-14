# contracts

Proto contracts for the ADR-7/ADR-8 sync saga calls (gRPC), shared between
whichever service hosts the server (e.g. inventory-service's
`ReservationService`) and whichever service calls it (order-service).
REST stays at the gateway edge (ADR-8) — this lib is only for the internal,
synchronous, service-to-service calls.

## Layout

- `proto/` — hand-authored `.proto` source. One subfolder per owning
  service, versioned in the package name (`ecomiq.inventory.v1`, etc.), not
  the directory — so a future breaking change adds `ecomiq.inventory.v2`
  messages/services to the same file tree rather than a parallel `v2/` proto
  directory.
- `src/generated/` — **checked in**, not a build step. Regenerate with
  `npm run contracts:gen` after editing a `.proto` file. Sandbox
  `npm install`/postinstall is unreliable, so CI/dev machines
  can't be relied on to codegen on every install — the output has to already
  be correct in the repo.
- `src/index.ts` — re-exports the generated types under `@temp-nx/contracts`
  so nothing outside this lib imports from `src/generated/*` directly.

## Regenerating

```
npm run contracts:gen
```

Requires `protoc` (the `protoc` npm package, already a devDependency —
ships a real prebuilt binary, no system install needed) and `ts-proto`
(also a devDependency, provides the `protoc-gen-ts_proto` plugin `protoc`
picks up automatically off `node_modules/.bin` via npm's script PATH).
Idempotent: re-running against an unchanged `.proto` produces a byte-identical
`src/generated/` tree.

The generation flags (`nestJs=true`, `outputServices=grpc-js`, `useDate=true`,
etc.) are set once in the `contracts:gen` script in the root `package.json` —
change them there, not per-invocation.

## Adding a new proto (marketing/payment services, ADR-7's other two saga calls)

1. Add `proto/<service>/v1/<name>.proto` following `reservation.proto`'s
   shape (one `service` per file, request/response messages with a typed
   `oneof` for expected business-rule failures, gRPC status codes reserved
   for actually-exceptional failures).
2. `npm run contracts:gen` — the script globs every `.proto` under `proto/`,
   no wiring needed per file.
3. Re-export the new generated module from `src/index.ts`.
