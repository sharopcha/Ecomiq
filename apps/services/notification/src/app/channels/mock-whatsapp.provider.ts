import { ulid } from 'ulid';
import { ChannelSendResult } from './channel-provider.types';
import { WhatsAppProviderPort, SendWhatsAppInput } from './whatsapp-provider.port';
import { isDeterministicRecipientFailure } from './deterministic-failure.util';

/**
 * No real WhatsApp message ever leaves the process — logs what a real Meta
 * adapter would have sent and returns a fabricated `providerMessageId`. A
 * real adapter implementing this same port is a drop-in swap via
 * `NOTIFICATION_WHATSAPP_PROVIDER` (`channels.module.ts`).
 */
export class MockWhatsAppProvider extends WhatsAppProviderPort {
  readonly name = 'mock';

  async send(input: SendWhatsAppInput): Promise<ChannelSendResult> {
    if (isDeterministicRecipientFailure(input.to)) {
      // eslint-disable-next-line no-console
      console.log(`[WhatsAppProviderPort:mock] FAILED send to=${input.to}`);
      return {
        ok: false,
        reason: 'DETERMINISTIC_TEST_FAILURE',
        message: 'mock whatsapp provider: deterministic failure (recipient ends in .fail)',
      };
    }
    const providerMessageId = `mock_wa_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(`[WhatsAppProviderPort:mock] SENT to=${input.to} -> ${providerMessageId}`);
    return { ok: true, providerMessageId };
  }
}
