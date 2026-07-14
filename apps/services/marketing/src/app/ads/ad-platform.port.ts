/**
 * Provider-agnostic abstraction (mirroring payment-service's
 * `PaymentProviderPort` discipline): the only file
 * allowed to know what "logging stub" (or later "meta"/"google") means is
 * the adapter registered against this port (see `ad-platform.module.ts`).
 * `AdsService` speaks only this port's language. No live platform
 * connectors exist yet — the logging stub is the sole adapter.
 *
 * Narrow with `=== false` only (repo rule: no `strictNullChecks`).
 */

export interface PublishAdInput {
  adId: string;
  platform: 'meta' | 'google';
  title: string;
  budgetMinor: number;
  audience?: Record<string, unknown> | null;
}

export type PublishAdResult =
  | { ok: true; externalRef: string }
  | { ok: false; reason: string };

export abstract class AdPlatformPort {
  abstract readonly name: string;

  abstract publish(input: PublishAdInput): Promise<PublishAdResult>;
}
