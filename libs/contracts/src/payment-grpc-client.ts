import {
  ChannelCredentials,
  credentials as grpcCredentials,
  makeGenericClientConstructor,
  Metadata,
  status,
} from '@grpc/grpc-js';
import type { Client } from '@grpc/grpc-js';
import {
  CancelPaymentIntentRequest,
  CancelPaymentIntentResponse,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  PaymentIntentServiceService,
} from './generated/payment/v1/payment_intent';

/**
 * Authenticated client for payment-service's `PaymentIntentService` —
 * order-service's checkout saga (ADR-7) consumes this as-is. Mirrors
 * `inventory-grpc-client.ts` exactly:
 * a plain `@grpc/grpc-js` client (not NestJS's `ClientGrpc`) so per-call
 * metadata (a client-credentials token, refreshed on the caller's own
 * schedule) can be attached without a Nest DI context.
 */

export interface PaymentGrpcClientOptions {
  /** `host:port` of payment-service's gRPC listener, e.g. `localhost:50053`. */
  url: string;
  /** Same contract as `InventoryGrpcClientOptions.getToken` — a callback so the caller controls token freshness. */
  getToken: () => string | Promise<string>;
  /** Per-call deadline in milliseconds — defaults to 2000ms, same ADR-7 fail-fast reasoning as the inventory client. */
  deadlineMs?: number;
  /** Defaults to plaintext — internal, same-network call authenticated via the bearer token above. */
  channelCredentials?: ChannelCredentials;
}

/** Thrown for any non-OK gRPC status — lets callers `instanceof`-check rather than inspect a raw `ServiceError`. */
export class PaymentGrpcError extends Error {
  constructor(
    public readonly code: status,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentGrpcError';
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

export interface PaymentGrpcClient {
  createPaymentIntent(request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse>;
  cancelPaymentIntent(request: CancelPaymentIntentRequest): Promise<CancelPaymentIntentResponse>;
  /** Closes the underlying channel. Call on shutdown — the client otherwise keeps the process alive. */
  close(): void;
}

const DEFAULT_DEADLINE_MS = 2_000;

const RawPaymentIntentServiceClient = makeGenericClientConstructor(
  PaymentIntentServiceService as never,
  'PaymentIntentService',
);

export function createPaymentGrpcClient(opts: PaymentGrpcClientOptions): PaymentGrpcClient {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const channel = new RawPaymentIntentServiceClient(
    opts.url,
    opts.channelCredentials ?? grpcCredentials.createInsecure(),
  ) as unknown as Client & {
    createPaymentIntent(
      request: CreatePaymentIntentRequest,
      metadata: Metadata,
      options: { deadline: Date },
      callback: (err: unknown, response?: CreatePaymentIntentResponse) => void,
    ): unknown;
    cancelPaymentIntent(
      request: CancelPaymentIntentRequest,
      metadata: Metadata,
      options: { deadline: Date },
      callback: (err: unknown, response?: CancelPaymentIntentResponse) => void,
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

  function mapError(err: unknown): PaymentGrpcError {
    if (err && typeof err === 'object' && 'code' in err) {
      const { code, details, message } = err as { code: status; details?: string; message?: string };
      return new PaymentGrpcError(code, details ?? message ?? 'gRPC call failed');
    }
    return new PaymentGrpcError(status.UNKNOWN, err instanceof Error ? err.message : String(err));
  }

  return {
    async createPaymentIntent(request) {
      const metadata = await callMetadata();
      return new Promise((resolve, reject) => {
        channel.createPaymentIntent(request, metadata, callOptions(), (err, response) => {
          if (err) return reject(mapError(err));
          resolve(response as CreatePaymentIntentResponse);
        });
      });
    },

    async cancelPaymentIntent(request) {
      const metadata = await callMetadata();
      return new Promise((resolve, reject) => {
        channel.cancelPaymentIntent(request, metadata, callOptions(), (err, response) => {
          if (err) return reject(mapError(err));
          resolve(response as CancelPaymentIntentResponse);
        });
      });
    },

    close() {
      channel.close();
    },
  };
}
