/**
 * Pure helpers for the reverse-proxy handler (`service-proxy.ts`) — no HTTP,
 * no fetch, no Express types, so they're directly unit-testable without
 * standing up a server (codebase convention: pure logic in `.util.ts`,
 * mirrors e.g. `apps/services/catalog/src/app/products/pricing.util.ts`).
 */

/**
 * Headers that must never be forwarded verbatim between hops (RFC 7230
 * §6.1 plus a few Express/Node specifics). Shared by every proxy controller
 * — previously three diverging copies (auth/catalog/inventory), now one.
 */
export const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'host',
  'content-length',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips (or replaces) the gateway-facing prefix so the remainder can be
 * appended to the upstream service's base URL. Query strings ride along
 * unchanged since they're already part of `url`.
 *
 * - catalog/inventory: `matchPrefix='/api/catalog'`, no replacement — full
 *   strip, falling back to `/` when nothing is left (catalog/inventory's
 *   own controllers aren't prefixed with the service name).
 * - auth: `matchPrefix='/api/auth'`, `replacement='/auth'` — identity's own
 *   AuthController *is* literally named 'auth', so the prefix is rewritten,
 *   not dropped.
 */
export function rewriteProxyPath(url: string, matchPrefix: string, replacement = ''): string {
  const stripped = url.replace(new RegExp(`^${escapeRegExp(matchPrefix)}`), replacement);
  return stripped.length ? stripped : '/';
}

export interface ForwardingContext {
  /** The immediate client IP as Express/Node sees it (`req.ip` / `req.socket.remoteAddress`). */
  clientIp?: string;
  proto: string;
  host: string;
}

/**
 * Builds the outgoing header set: copies everything from the inbound
 * request except hop-by-hop headers, then appends/overwrites the standard
 * `x-forwarded-*` trio. `x-forwarded-for` is comma-appended (not
 * overwritten) so a chain of proxies accumulates correctly instead of the
 * gateway erasing whatever an upstream load balancer already set.
 */
export function buildProxyHeaders(
  reqHeaders: Record<string, string | string[] | undefined>,
  forwarding: ForwardingContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    out[lower] = Array.isArray(value) ? value.join(', ') : value;
  }

  if (forwarding.clientIp) {
    const existing = out['x-forwarded-for'];
    out['x-forwarded-for'] = existing
      ? `${existing}, ${forwarding.clientIp}`
      : forwarding.clientIp;
  }
  out['x-forwarded-proto'] = forwarding.proto;
  out['x-forwarded-host'] = forwarding.host;

  return out;
}

/** True for methods that never carry a body — used to decide whether to forward `req.body` at all. */
export function isBodylessMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/**
 * Extracts multi-value `set-cookie` from a fetch `Headers` object.
 * `Headers.get('set-cookie')` folds multiple cookies into one
 * comma-joined string, which browsers can't parse back apart — the
 * `getSetCookie()` extension (Node 18.14+/undici) preserves them as a
 * proper array. Applies to every proxy now (previously auth-proxy only —
 * a latent bug the moment catalog/inventory set a cookie).
 */
export function extractSetCookies(headers: Headers): string[] {
  return (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

export interface ProxyErrorResponse {
  statusCode: number;
  message: string;
}

/**
 * Maps a failed upstream `fetch()` to a gateway-facing status code/body.
 * Today a hung service pins gateway connections forever (no timeout) and a
 * down service produces an unhandled rejection -> 500; this makes both
 * cases explicit and typed.
 *
 * - Abort (our own `AbortSignal.timeout`) -> 504 Gateway Timeout.
 * - Connection failures (refused/DNS/undici TypeError) -> 502 Bad Gateway.
 * - Anything else -> 502 as a safe default (never let an upstream fetch
 *   failure crash the gateway process).
 */
export function classifyProxyError(err: unknown): { statusCode: number; body: ProxyErrorResponse } {
  const name = (err as { name?: string } | undefined)?.name;
  const code =
    (err as { cause?: { code?: string }; code?: string } | undefined)?.cause?.code ??
    (err as { code?: string } | undefined)?.code;

  if (name === 'AbortError' || name === 'TimeoutError') {
    return {
      statusCode: 504,
      body: { statusCode: 504, message: 'Upstream request timed out' },
    };
  }

  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || err instanceof TypeError) {
    return {
      statusCode: 502,
      body: { statusCode: 502, message: 'Upstream service unavailable' },
    };
  }

  return {
    statusCode: 502,
    body: { statusCode: 502, message: 'Upstream service error' },
  };
}
