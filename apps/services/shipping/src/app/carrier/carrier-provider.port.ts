/**
 * Provider-agnostic abstraction (a deliberate design constraint): the only
 * file allowed to know what "mock" (or later "easypost"/"shippo") means is
 * the adapter registered against this port (see `carrier.module.ts`).
 * `LabelsService`, controllers, and outbox events speak only this port's
 * language — never a provider's own shape. Mirrors
 * `apps/services/payment/src/app/provider/payment-provider.port.ts`.
 *
 * All result types are discriminated unions on a literal `ok` field.
 * **Narrow with `=== false` only** (repo rule: `tsconfig.base.json` doesn't
 * set `strictNullChecks`, so `!result.ok` does not narrow the union).
 */

export interface RatePackageInput {
  totalWeightKg?: number | null;
}

export interface RateDestinationInput {
  postalCode?: string | null;
  countryCode?: string | null;
  city?: string | null;
}

export interface GetRatesInput {
  carrier: string;
  packages: RatePackageInput[];
  destination: RateDestinationInput;
}

export type ProviderRateResult =
  | { ok: true; subtotalMinor: number; discountMinor: number; totalMinor: number }
  | { ok: false; reason: 'INVALID_INPUT'; message: string };

export interface PurchaseLabelInput {
  labelId: string;
  carrier: string;
  packages: RatePackageInput[];
  destination: RateDestinationInput;
}

export type ProviderPurchaseResult =
  | { ok: true; trackingNumber: string; labelUrl: string; totalMinor: number }
  | { ok: false; reason: 'DESTINATION_UNSERVICEABLE' | 'PROVIDER_UNAVAILABLE'; message: string };

export abstract class CarrierProviderPort {
  abstract readonly name: string;

  abstract getRates(input: GetRatesInput): Promise<ProviderRateResult>;

  abstract purchaseLabel(input: PurchaseLabelInput): Promise<ProviderPurchaseResult>;
}
