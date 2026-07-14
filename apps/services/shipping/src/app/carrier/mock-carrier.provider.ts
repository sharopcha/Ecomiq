import { ulid } from 'ulid';
import {
  CarrierProviderPort,
  GetRatesInput,
  ProviderPurchaseResult,
  ProviderRateResult,
  PurchaseLabelInput,
} from './carrier-provider.port';

/** Fixed per-carrier rate table — flat base fee plus a per-kg charge on total weight. Unrecognized carriers fall back to `DEFAULT_RATE`. */
const CARRIER_RATES: Record<string, { baseFeeMinor: number; perKgMinor: number }> = {
  usps: { baseFeeMinor: 500, perKgMinor: 300 },
  fedex: { baseFeeMinor: 800, perKgMinor: 450 },
  ups: { baseFeeMinor: 750, perKgMinor: 420 },
  dhl: { baseFeeMinor: 900, perKgMinor: 500 },
};

const DEFAULT_RATE = { baseFeeMinor: 600, perKgMinor: 350 };

/**
 * Deterministic failure rule, payment's amount-ends-99 precedent applied to
 * a destination postal code: any code ending in `99` is treated as
 * unserviceable. Pure function so both `MockCarrierProvider` and any future
 * test/demo script can call it without importing the whole class.
 */
export function isDestinationUnserviceable(postalCode: string | null | undefined): boolean {
  return !!postalCode && postalCode.endsWith('99');
}

function quoteTotals(carrier: string, packages: ReadonlyArray<{ totalWeightKg?: number | null }>) {
  const rate = CARRIER_RATES[carrier.toLowerCase()] ?? DEFAULT_RATE;
  const subtotalMinor = packages.reduce((sum, pkg) => {
    const weightKg = pkg.totalWeightKg ?? 0;
    return sum + rate.baseFeeMinor + Math.round(weightKg * rate.perKgMinor);
  }, 0);
  return { subtotalMinor, discountMinor: 0, totalMinor: subtotalMinor };
}

/**
 * In-memory/deterministic adapter — no real carrier is ever called, no
 * external network request, no persistent state of its own (the
 * `ShippingLabel` row `LabelsService` maintains is the actual source of
 * truth). Exists so the whole labels/purchase flow can be built and demoed
 * end-to-end before a real EasyPost/Shippo account exists — a second
 * adapter implementing the same port is a drop-in swap via
 * `SHIPPING_CARRIER_PROVIDER=easypost` (`carrier.module.ts`), with zero
 * changes to any code that only knows the port.
 */
export class MockCarrierProvider extends CarrierProviderPort {
  readonly name = 'mock';

  async getRates(input: GetRatesInput): Promise<ProviderRateResult> {
    // The mock's rate math ignores `destination` entirely (flat per-carrier
    // table) — a real adapter's rates genuinely vary by zone, this fixture
    // doesn't need to. `destination` still flows through the port's shape
    // so a real adapter's signature doesn't need to change later.
    void input.destination;
    return { ok: true, ...quoteTotals(input.carrier, input.packages) };
  }

  async purchaseLabel(input: PurchaseLabelInput): Promise<ProviderPurchaseResult> {
    if (isDestinationUnserviceable(input.destination.postalCode)) {
      return {
        ok: false,
        reason: 'DESTINATION_UNSERVICEABLE',
        message: `mock provider: deterministic purchase failure (destination postal code "${input.destination.postalCode}" ends in 99)`,
      };
    }
    const { totalMinor } = quoteTotals(input.carrier, input.packages);
    return {
      ok: true,
      trackingNumber: `TRK-${ulid()}`,
      labelUrl: `https://mock-carrier.local/labels/${ulid()}.pdf`,
      totalMinor,
    };
  }
}
