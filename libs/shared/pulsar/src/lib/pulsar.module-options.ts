export interface PulsarModuleOptions {
  /** e.g. "pulsar://localhost:6650" — see PULSAR_SERVICE_URL in .env. */
  serviceUrl: string;
  /** Pulsar tenant — "ecomiq" for every service (see PULSAR_TENANT). */
  tenant: string;
  /**
   * Pulsar namespace — one per owning service, e.g. "catalog"/"inventory".
   * Each service reads its own <SERVICE>_PULSAR_NAMESPACE env var (e.g.
   * CATALOG_PULSAR_NAMESPACE, INVENTORY_PULSAR_NAMESPACE) rather than a
   * shared generic key, so namespaces don't collide across services running
   * side-by-side via `nx serve` against one root .env.
   */
  namespace: string;
  /** How often (ms) the outbox relay polls for unpublished rows. Default 1000. */
  relayIntervalMs?: number;
  /** Max outbox rows published per relay tick. Default 20. */
  relayBatchSize?: number;
  /**
   * Client-credential token for Pulsar's
   * broker-side token auth (`PULSAR_AUTH_TOKEN` env, plumbed through by each
   * service's PulsarModule.forRootAsync useFactory). Undefined (dev default,
   * unset env var) means the client connects with no `authentication` field
   * at all — identical to today's behavior against an unauthenticated
   * standalone broker. Prod enables broker-side token auth
   * (docker-compose.prod.yml) and sets this so publishers/the outbox relay
   * can actually connect.
   */
  authToken?: string;
}

export const PULSAR_MODULE_OPTIONS = Symbol('PULSAR_MODULE_OPTIONS');
