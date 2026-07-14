import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for media-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base URL.
 * Mirrors `ShippingProxyController`/`PurchasingProxyController`.
 *
 * media-service's own controllers are not prefixed with "media" — the
 * gateway owns the `/api/media/*` namespace, so `/api/media/health` strips
 * down to `/health` before being appended to `MEDIA_SERVICE_URL`
 * (`http://localhost:3011/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * media-service re-validates the JWT itself). The public file-serving
 * routes (`/api/media/public/*`, storefront PDPs) have their own
 * narrowly-scoped `@Public()` sub-route (`MediaPublicProxyController`),
 * registered before this catch-all in `MediaProxyModule` — bytes for an
 * *upload* never transit the gateway at all (presign-direct-to-MinIO, plan
 * §0), so this catch-all only ever proxies small JSON requests, no
 * PROXY_BODY_LIMIT tuning needed beyond the shared default.
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/payments` 404 gap for payment-service; the same gap would otherwise
 * exist here for `GET /api/media?...`).
 */
@Controller('media')
export class MediaProxyController {
  private readonly mediaBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.mediaBaseUrl = this.config
      .get<string>('MEDIA_SERVICE_URL', 'http://localhost:3011/api')
      .replace(/\/$/, '');
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res);
  }

  // NestJS 11 pins `path-to-regexp` to 8.x, which dropped bare Express 4
  // wildcards (`*`) in favor of named ones (`*path`) — using the old syntax
  // crashes route registration at boot ("pathToRegexp is not a function").
  // `*path` has the same catch-all semantics as the old `*`.
  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.mediaBaseUrl,
      matchPrefix: '/api/media',
    });
  }
}
