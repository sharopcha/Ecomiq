/**
 * Idempotent Pulsar tenant/namespace provisioning via the admin REST API.
 *
 * Pulsar standalone ships with the "public"/"sample" tenants pre-created,
 * but our topic-naming convention (`persistent://<tenant>/<namespace>/...`,
 * see topics.ts) uses our own "ecomiq" tenant with one namespace per owning
 * service — and those don't exist until something creates them. Producer/
 * consumer creation on a topic under a namespace that doesn't exist doesn't
 * fail fast; it hangs until the client's operation timeout and surfaces as
 * a generic `TimeOut` error, which is exactly what happens if this step is
 * skipped.
 *
 * Uses "create, treat 409 (already exists) as success" rather than a
 * check-then-create GET, since Pulsar's admin API doesn't expose a clean
 * single-namespace existence check — this way is idempotent regardless.
 */

export interface ProvisionOptions {
  adminUrl: string;
  tenant: string;
  /** Pulsar standalone's auto-created cluster is literally named "standalone". */
  cluster?: string;
  /**
   * Admin bearer token — required once the broker has
   * `authenticationEnabled=true` (the prod profile); the admin API
   * rejects unauthenticated requests with 401 otherwise. Unset in dev,
   * where the broker has no auth.
   */
  authToken?: string;
}

function authHeaders(authToken?: string): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function ensurePulsarTenant(options: ProvisionOptions): Promise<void> {
  const { adminUrl, tenant, cluster = 'standalone', authToken } = options;
  const res = await fetch(`${adminUrl}/admin/v2/tenants/${tenant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
    body: JSON.stringify({ allowedClusters: [cluster] }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`failed to create Pulsar tenant "${tenant}": ${res.status} ${await res.text()}`);
  }
  console.log(
    res.status === 409
      ? `[pulsar-provision] tenant "${tenant}" already exists`
      : `[pulsar-provision] created tenant "${tenant}"`,
  );
}

export async function ensurePulsarNamespace(
  options: ProvisionOptions & { namespace: string },
): Promise<void> {
  const { adminUrl, tenant, namespace, authToken } = options;
  const fq = `${tenant}/${namespace}`;
  const res = await fetch(`${adminUrl}/admin/v2/namespaces/${fq}`, {
    method: 'PUT',
    headers: authHeaders(authToken),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`failed to create Pulsar namespace "${fq}": ${res.status} ${await res.text()}`);
  }
  console.log(
    res.status === 409
      ? `[pulsar-provision] namespace "${fq}" already exists`
      : `[pulsar-provision] created namespace "${fq}"`,
  );
}

/**
 * Pre-creates a persistent, non-partitioned topic.
 * `allowAutoTopicCreation=true` (the broker's dev/standalone
 * default) means this is not strictly required for a consumer/producer to
 * eventually succeed — but a consumer that's first to subscribe on a
 * genuinely fresh namespace has been observed to fail its very first
 * `Consumer.subscribe()` call with `TopicNotFound` (a real timing race
 * between namespace-bundle-ownership propagating and the subscribe call
 * landing, reproduced live after a Pulsar
 * volume reset), which crash-loops the whole container under Compose's
 * `service_healthy` dependency gating. Pre-creating the topic here removes
 * that race entirely. `namespace` is the bare namespace (e.g. `"orders"`),
 * `topic` is just the topic name within it (e.g. `"order.events"`) —
 * matches `topicForAggregate`/`topicForCommands`'s own `<aggregate>.events`
 * / `<service>.commands` naming, not a full `persistent://...` URL.
 */
export async function ensurePulsarTopic(
  options: ProvisionOptions & { namespace: string; topic: string },
): Promise<void> {
  const { adminUrl, tenant, namespace, topic, authToken } = options;
  const fq = `${tenant}/${namespace}/${topic}`;
  const res = await fetch(`${adminUrl}/admin/v2/persistent/${fq}`, {
    method: 'PUT',
    headers: authHeaders(authToken),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`failed to create Pulsar topic "${fq}": ${res.status} ${await res.text()}`);
  }
  console.log(
    res.status === 409
      ? `[pulsar-provision] topic "${fq}" already exists`
      : `[pulsar-provision] created topic "${fq}"`,
  );
}
