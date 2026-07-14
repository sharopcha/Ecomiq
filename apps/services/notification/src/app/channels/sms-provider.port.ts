import { ChannelSendResult } from './channel-provider.types';

/** Provider-agnostic abstraction — see `EmailProviderPort`'s doc comment for the full pattern. */

export interface SendSmsInput {
  to: string;
  body: string;
}

export abstract class SmsProviderPort {
  abstract readonly name: string;

  abstract send(input: SendSmsInput): Promise<ChannelSendResult>;
}
