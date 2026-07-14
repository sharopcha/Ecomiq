import {
  ChannelCredentials,
  credentials as grpcCredentials,
  makeGenericClientConstructor,
  Metadata,
  status,
} from '@grpc/grpc-js';
import type { Client } from '@grpc/grpc-js';
import {
  ReleaseReservationRequest,
  ReleaseReservationResponse,
  ReservationServiceService,
  ReserveStockRequest,
  ReserveStockResponse,
} from './generated/inventory/v1/reservation';

/**
 * Authenticated client for inventory-service's `ReservationService` —
 * order-service's checkout saga (ADR-7) consumes this as-is, it isn't
 * meant to be rebuilt per-consumer.
 *
 * Deliberately a plain `@grpc/grpc-js` client (via `makeGenericClientConstructor`
 * over the ts-proto-generated `ReservationServiceService` definition) rather
 * than NestJS's `ClientGrpc`/`ClientProxyFactory` — that route needs a Nest
 * module/DI context and doesn't give an easy hook for per-call metadata, and
 * a client-credentials token has to be attached on every call (it's an
 * internal service token, not something set once at channel-creation time).
 * This factory has no NestJS dependency at all, so order-service (or
 * anything else) can call it directly.
 */

export interface InventoryGrpcClientOptions {
  /** `host:port` of inventory-service's gRPC listener, e.g. `localhost:50051`. */
  url: string;
  /**
   * Supplies a valid internal (client-credentials) bearer token for each
   * call's `authorization` metadata. Deliberately a callback, not a static
   * token: the caller (order-service) is expected to fetch-and-cache a
   * ~5-minute token from identity-service's `POST /auth/token` and
   * refresh it on its own schedule — this factory doesn't manage that
   * lifecycle, it just asks for a current token on every call.
   */
  getToken: () => string | Promise<string>;
  /**
   * Per-call deadline in milliseconds. Defaults to 2000ms — ADR-7's sync
   * saga calls are meant to fail fast rather than pile up behind a slow
   * inventory-service (mirrors `ReservationGrpcController`'s own
   * `assertDeadlineNotExceeded`, which honors whatever deadline the caller
   * actually set).
   */
  deadlineMs?: number;
  /**
   * Channel credentials. Defaults to plaintext (`ChannelCredentials.createInsecure()`)
   * — this is an internal, same-network service-to-service call authenticated
   * via the bearer token above, not a public-facing TLS endpoint. Pass real
   * credentials here if/when inventory-service's gRPC listener is put behind
   * TLS.
   */
  channelCredentials?: ChannelCredentials;
}

/** Thrown for any non-OK gRPC status — lets callers `instanceof`-check rather than inspect a raw `ServiceError`. */
export class InventoryGrpcError extends Error {
  constructor(
    public readonly code: status,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryGrpcError';
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

export interface InventoryGrpcClient {
  reserveStock(request: ReserveStockRequest): Promise<ReserveStockResponse>;
  releaseReservation(request: ReleaseReservationRequest): Promise<ReleaseReservationResponse>;
  /** Closes the underlying channel. Call on shutdown — the client otherwise keeps the process alive. */
  close(): void;
}

const DEFAULT_DEADLINE_MS = 2_000;

// `ReservationServiceService`'s shape (path/requestStream/responseStream/
// (de)serialize per method, keyed by method name) is exactly what
// `@grpc/grpc-js` calls a `ServiceDefinition` — it's the same object shape
// NestJS's own `Transport.GRPC` server loads from the .proto at runtime, ts-proto
// just also emits it as a typed JS object so a raw grpc-js client can be
// built from it without re-parsing the .proto.
const RawReservationServiceClient = makeGenericClientConstructor(
  ReservationServiceService as never,
  'ReservationService',
);

export function createInventoryGrpcClient(opts: InventoryGrpcClientOptions): InventoryGrpcClient {
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const channel = new RawReservationServiceClient(
    opts.url,
    opts.channelCredentials ?? grpcCredentials.createInsecure(),
  ) as unknown as Client & {
    reserveStock(
      request: ReserveStockRequest,
      metadata: Metadata,
      options: { deadline: Date },
      callback: (err: unknown, response?: ReserveStockResponse) => void,
    ): unknown;
    releaseReservation(
      request: ReleaseReservationRequest,
      metadata: Metadata,
      options: { deadline: Date },
      callback: (err: unknown, response?: ReleaseReservationResponse) => void,
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

  function mapError(err: unknown): InventoryGrpcError {
    if (err && typeof err === 'object' && 'code' in err) {
      const { code, details, message } = err as { code: status; details?: string; message?: string };
      return new InventoryGrpcError(code, details ?? message ?? 'gRPC call failed');
    }
    return new InventoryGrpcError(status.UNKNOWN, err instanceof Error ? err.message : String(err));
  }

  return {
    async reserveStock(request) {
      const metadata = await callMetadata();
      return new Promise((resolve, reject) => {
        channel.reserveStock(request, metadata, callOptions(), (err, response) => {
          if (err) return reject(mapError(err));
          resolve(response as ReserveStockResponse);
        });
      });
    },

    async releaseReservation(request) {
      const metadata = await callMetadata();
      return new Promise((resolve, reject) => {
        channel.releaseReservation(request, metadata, callOptions(), (err, response) => {
          if (err) return reject(mapError(err));
          resolve(response as ReleaseReservationResponse);
        });
      });
    },

    close() {
      channel.close();
    },
  };
}
