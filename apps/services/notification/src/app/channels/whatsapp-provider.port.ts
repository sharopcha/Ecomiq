import { ChannelSendResult } from './channel-provider.types';

/** Provider-agnostic abstraction — see `EmailProviderPort`'s doc comment for the full pattern. */

export interface SendWhatsAppInput {
  to: string;
  body: string;
}

export abstract class WhatsAppProviderPort {
  abstract readonly name: string;

  abstract send(input: SendWhatsAppInput): Promise<ChannelSendResult>;
}
