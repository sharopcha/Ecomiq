# api-types

Framework-agnostic TypeScript contracts shared between the frontend apps
(`apps/frontend/storefront`, `apps/frontend/admin`) and the backend services
(`apps/services/*`). Plain `interface`/`type` declarations only — no
`class-validator` decorators, no NestJS/Angular/React imports — so this lib
is safe to import from a browser bundle, an Angular build, or a NestJS
service without pulling in unwanted runtime dependencies.

One folder per domain under `src/`, each with its own `index.ts` barrel.
Import the whole library via `@temp-nx/api-types`, or a single domain via
`@temp-nx/api-types/<domain>` (e.g. `@temp-nx/api-types/catalog`).

NestJS request DTOs that need `class-validator` decorators stay as classes
in their own service, but should `implements` the matching plain interface
from here to keep the wire shape structurally in sync.
