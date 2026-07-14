import {
  ChannelCredentials,
  credentials as grpcCredentials,
  makeGenericClientConstructor,
  Metadata,
  status,
} from '@grpc/grpc-js';
import type { Client } from '@grpc/grpc-js';
import {
  DiscountServiceService,
  ValidateDiscountRequest,
  ValidateDiscountResponse,
} from './generated/marketing/v1/discount';

/**
 * Authenticated client for marketing-service's `DiscountService` —
 * order-service's checkout saga (ADR-7) consumes this as-is. Mirrors
 * `inventory-grpc-client.ts`/
 * `payment-grpc-client.ts` exactly — see either's doc comment for why this
 * is a plain `@grpc/grpc-js` client rather than NestJS's `ClientGrpc`.
 */

export interface MarketingGrpcClientOptions {
  /** `host:port` of marketing-service's gRPC listener, e.g. `localhost:50052`. */
  url: string;
  getToken: () => string | Promise<string>;
  /** Per-call deadline in milliseconds — defaults to 2000ms, same ADR-7 fail-fast reasoning. */
  deadlineMs?: number;
  channelCredentials?: ChannelCredentials;
}

/** Thrown for any non-OK gRPC status — lets callers `instanceof`-check rather than inspect a raw `ServiceError`. */
export class MarketingGrpcError extends Error {
  constructor(
    public readonly code: status,
    message: string,
  ) {
    super(message);
    this.name = 'MarketingGrpcError';
  }

  get isUnauthenticated(): boolean {
    return this.code === status.UNAUTHENTICATED;
  }

  get isPermissionDenied(): boolean {
    return this.code === status.PERMISSION_DENIED;
  }

  get isDeadlineExceeded(): boolean {
    return this.code === status.DEADLINE_EXCEEDED;
  }
}

export interface MarketingGrpcClient {
  validateDiscount(request: ValidateDiscountRequest): Promise<ValidateDiscountResponse>;
  /** Closes the underlying channel. Call on shutdown — the client otherwise keeps the process alive. */
  close(): void;
}

const DEFAULT_DEADLINE_MS = 2_000;

const RawDiscountServiceClient = makeGenericClientConstructor(
  DiscountServiceService as never,
  'DiscountService',
);

export function createMarketingGrpcClient(opts: MarketingGrpcClientOptions): MarketingGrpcClient {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const channel = new RawDiscountServiceClient(
    opts.url,
    opts.channelCredentials ?? grpcCredentials.createInsecure(),
  ) as unknown as Client & {
    validateDiscount(
      request: ValidateDiscountRequest,
      metadata: Metadata,
      options: { deadline: Date },
      callback: (err: unknown, response?: ValidateDiscountResponse) => void,
    ): unknown;
  };

  async function callMetadata(): Promise<Metadata> {
    const metadata = new Metadata();
    metadata.set('authorization', `Bearer ${await opts.getToken()}`);
    return metadata;
  }

  function callOptions(): { deadline: Date } {
    return { deadline: new Date(Date.now() + deadlineMs) };
  }

  function mapError(err: unknown): MarketingGrpcError {
    if (err && typeof err === 'object' && 'code' in err) {
      const { code, details, message } = err as { code: status; details?: string; message?: string };
      return new MarketingGrpcError(code, details ?? message ?? 'gRPC call failed');
    }
    return new MarketingGrpcError(status.UNKNOWN, err instanceof Error ? err.message : String(err));
  }

  return {
    async validateDiscount(request) {
      const metadata = await callMetadata();
      return new Promise((resolve, reject) => {
        channel.validateDiscount(request, metadata, callOptions(), (err, response) => {
          if (err) return reject(mapError(err));
          resolve(response as ValidateDiscountResponse);
        });
      });
    },

    close() {
      channel.close();
    },
  };
}
