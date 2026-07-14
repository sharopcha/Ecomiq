import type { Request, Response } from 'express';
import {
  HOP_BY_HOP_HEADERS,
  buildProxyHeaders,
  classifyProxyError,
  extractSetCookies,
  isBodylessMethod,
  rewriteProxyPath,
} from './service-proxy.util';

export interface ProxyOptions {
  /** Upstream service base URL, no trailing slash (e.g. `http://localhost:3002/api`). */
  baseUrl: string;
  /** Gateway-facing prefix to strip/rewrite, e.g. `/api/catalog`. */
  matchPrefix: string;
  /** What to replace `matchPrefix` with (default: drop it). auth-proxy uses `/auth`. */
  replacement?: string;
  /** Overrides `PROXY_UPSTREAM_TIMEOUT_MS` — mainly for tests. */
  timeoutMs?: number;
}

/**
 * Single shared reverse-proxy handler used by every `*ProxyController`
 * (auth/catalog/inventory/order/payment/marketing). Replaces three
 * diverging copies that: re-serialized bodies with `JSON.stringify(req.body)`
 * (breaks multipart/urlencoded/binary — product image uploads failed
 * through the gateway), had no upstream timeout, and only auth-proxy
 * handled multi-value `set-cookie` / 3xx relay.
 *
 * Requires the app to be bootstrapped with `bodyParser: false` +
 * `express.raw({ type: () => true })` mounted globally (see `main.ts`) so
 * `req.body` arrives here as a raw `Buffer`, forwarded verbatim.
 */
export async function proxyRequest(req: Request, res: Response, opts: ProxyOptions): Promise<void> {
  const path = rewriteProxyPath(req.url, opts.matchPrefix, opts.replacement ?? '');
  const targetUrl = `${opts.baseUrl}${path}`;

  const forwardedHeaders = buildProxyHeaders(req.headers, {
    clientIp: req.ip,
    proto: req.protocol,
    host: req.headers.host ?? '',
  });
  const headers = new Headers(forwardedHeaders);

  const bodyBuffer = req.body as Buffer | undefined;
  const hasBody = !isBodylessMethod(req.method) && Buffer.isBuffer(bodyBuffer) && bodyBuffer.length > 0;

  const timeoutMs = opts.timeoutMs ?? Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS ?? 10_000);

  let upstreamResponse: globalThis.Response;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      // Buffer isn't structurally a `BodyInit` per lib.dom's fetch typings
      // (it satisfies BufferSource at runtime; the type-checker doesn't
      // narrow that far) — a plain Uint8Array view over the same bytes,
      // zero-copy, keeps this typed correctly.
      body: hasBody && bodyBuffer ? new Uint8Array(bodyBuffer) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const { statusCode, body } = classifyProxyError(err);
    res.status(statusCode).json(body);
    return;
  }

  res.status(upstreamResponse.status);

  upstreamResponse.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    if (key.toLowerCase() === 'set-cookie') return; // handled below (multi-value)
    res.setHeader(key, value);
  });

  const setCookies = extractSetCookies(upstreamResponse.headers);
  if (setCookies.length) res.setHeader('set-cookie', setCookies);

  // 3xx (e.g. Google OAuth redirect) — relay verbatim, browser follows it.
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
  res.send(buffer);
}
