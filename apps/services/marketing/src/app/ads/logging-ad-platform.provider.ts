import { ulid } from 'ulid';
import { AdPlatformPort, PublishAdInput, PublishAdResult } from './ad-platform.port';

/**
 * The only adapter today ("no live platform connectors"). Logs what a
 * real Meta/Google adapter would have
 * sent and returns a deterministic synthetic `externalRef`, same
 * "compute a result from inputs, no external call, no state of its own"
 * shape as `MockPaymentProvider`. A real adapter implementing this same
 * port is a drop-in swap via `AD_PLATFORM_PROVIDER` (`ad-platform.module.ts`),
 * with zero changes to `AdsService`.
 */
export class LoggingAdPlatformProvider extends AdPlatformPort {
  readonly name = 'logging-stub';

  async publish(input: PublishAdInput): Promise<PublishAdResult> {
    const externalRef = `stub_ad_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[AdPlatformPort:logging-stub] would publish ad ${input.adId} to ${input.platform} (budgetMinor=${input.budgetMinor}) -> ${externalRef}`,
      { title: input.title, audience: input.audience ?? null },
    );
    return { ok: true, externalRef };
  }
}
