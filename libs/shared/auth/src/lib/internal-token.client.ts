import { Inject, Injectable } from '@nestjs/common';

export const INTERNAL_TOKEN_CLIENT_OPTIONS = Symbol('INTERNAL_TOKEN_CLIENT_OPTIONS');

export interface InternalTokenClientOptions {
  /** Full URL to identity's client-credentials token endpoint, e.g. `http://localhost:3001/api/auth/token`. */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Space-delimited scope string requested on every fetch. Omit to receive every scope the account is allowed. */
  scope?: string;
  /** Injectable clock — defaults to `Date.now`. Only ever overridden by specs (a fake clock). */
  now?: () => number;
}

interface CachedToken {
  accessToken: string;
  /** Epoch ms — past this point, `getToken()` proactively refetches rather than handing back the cached token. Set to 80% of the token's actual TTL (identity's `JWT_INTERNAL_TTL`, 5 minutes today), not the hard expiry. */
  refreshAt: number;
}

/**
 * Fetches and caches client-credentials (internal) bearer tokens from
 * identity's `POST /auth/token` — the
 * `getToken: () => string | Promise<string>` callback every
 * `create*GrpcClient` factory in `@temp-nx/contracts` expects. Those
 * factories re-invoke the callback on *every* RPC by design (see
 * `InventoryGrpcClientOptions.getToken`'s doc comment) — this class is what
 * makes that cheap instead of a network round-trip per call.
 *
 * Refreshes at 80% of the token's TTL rather than waiting for it to expire
 * — a saga step that's mid-flight when the token would otherwise expire
 * must not fail an RPC over an avoidable race. Concurrent callers past that
 * 80% mark all await the *same* in-flight fetch (single-flight): the check
 * for "do we need to refetch" and the assignment of `this.inFlight` happen
 * synchronously with no `await` between them, so there's no window for two
 * concurrent callers to both start a fetch — standard single-flight-in-JS,
 * not a locking primitive.
 */
@Injectable()
export class InternalTokenClient {
  private cached?: CachedToken;
  private inFlight?: Promise<CachedToken>;
  private readonly now: () => number;

  constructor(@Inject(INTERNAL_TOKEN_CLIENT_OPTIONS) private readonly options: InternalTokenClientOptions) {
    this.now = options.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    const nowMs = this.now();
    if (this.cached && nowMs < this.cached.refreshAt) {
      return this.cached.accessToken;
    }

    if (!this.inFlight) {
      this.inFlight = this.fetchToken().finally(() => {
        this.inFlight = undefined;
      });
    }

    const token = await this.inFlight;
    this.cached = token;
    return token.accessToken;
  }

  private async fetchToken(): Promise<CachedToken> {
    const response = await fetch(this.options.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...(this.options.scope ? { scope: this.options.scope } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`InternalTokenClient: token request failed: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    const nowMs = this.now();
    return {
      accessToken: body.access_token,
      refreshAt: nowMs + body.expires_in * 1000 * 0.8,
    };
  }
}
