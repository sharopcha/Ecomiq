import { ulid } from 'ulid';
import { ChannelSendResult } from './channel-provider.types';
import { SmsProviderPort, SendSmsInput } from './sms-provider.port';
import { isDeterministicRecipientFailure } from './deterministic-failure.util';

/**
 * No real SMS ever leaves the process — logs what a real Twilio adapter
 * would have sent and returns a fabricated `providerMessageId`. A real
 * adapter implementing this same port is a drop-in swap via
 * `NOTIFICATION_SMS_PROVIDER` (`channels.module.ts`).
 */
export class MockSmsProvider extends SmsProviderPort {
  readonly name = 'mock';

  async send(input: SendSmsInput): Promise<ChannelSendResult> {
    if (isDeterministicRecipientFailure(input.to)) {
      // eslint-disable-next-line no-console
      console.log(`[SmsProviderPort:mock] FAILED send to=${input.to}`);
      return {
        ok: false,
        reason: 'DETERMINISTIC_TEST_FAILURE',
        message: 'mock sms provider: deterministic failure (recipient ends in .fail)',
      };
    }
    const providerMessageId = `mock_sms_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(`[SmsProviderPort:mock] SENT to=${input.to} -> ${providerMessageId}`);
    return { ok: true, providerMessageId };
  }
}
