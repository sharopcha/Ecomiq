# pulsar

This library was generated with [Nx](https://nx.dev).

Custom NestJS transport strategy over `pulsar-client`, the transactional-outbox relay, and the event envelope format shared by every service's domain events.

- `PulsarModule.forRootAsync(...)` — import in a service's `AppModule` to get `PulsarProducerService` + the outbox relay poller.
- `PulsarServer` — construct directly in `main.ts` and pass to `app.connectMicroservice({ strategy })` for the consumer side; handlers are plain `@EventPattern('some.event.type')` methods.
- `recordOutboxEvent(manager, ...)` — call inside a domain transaction to write the outbox row alongside the entity change it describes.
- `createEnvelope`/`encodeEnvelope`/`decodeEnvelope` — the wire format (`EventEnvelope`).
- `ensurePulsarTenant`/`ensurePulsarNamespace` — idempotent tenant/namespace provisioning via the admin REST API (see below — a fresh Pulsar container doesn't have our "ecomiq" tenant yet, only the built-in "public"/"sample" ones).

## Provisioning

Our topic convention (`persistent://ecomiq/<namespace>/<aggregate>.events`, see `topics.ts`) needs the "ecomiq" tenant and one namespace per owning service to exist in Pulsar before any producer/consumer can be created on them — a fresh `docker compose up -d pulsar` does **not** have these yet, only Pulsar's own built-in "public"/"sample" tenant. Creating them is a one-line admin API call, but skipping it doesn't fail fast: producer/consumer creation just hangs until the client's operation timeout and surfaces as a generic `TimeOut` error, which is confusing to debug blind.

Run once per fresh broker (safe to re-run):

```sh
npm run pulsar:provision
```

`npm run pulsar:demo` also calls this itself before subscribing, so the demo alone is enough on a brand new container — `pulsar:provision` is there as a standalone step for when a new service (inventory, order, ...) needs its own namespace added to the list in `src/demo/provision.ts`.

## Demo: prove produce/consume against a live broker

```sh
docker compose up -d pulsar
npm run pulsar:demo
```

Requires `pulsar-client`'s native module to actually be installed (see the root README/CLAUDE notes on that — the package ships prebuilt binaries for some platform/arch combos and falls back to a from-source build needing the Apache Pulsar C++ client otherwise).
