import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for purchasing-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base URL.
 * Mirrors `ShippingProxyController`/`CrmProxyController`.
 *
 * purchasing-service's own controllers are not prefixed with "purchasing" —
 * the gateway owns the `/api/purchasing/*` namespace, so
 * `/api/purchasing/health` strips down to `/health` before being appended
 * to `PURCHASING_SERVICE_URL` (`http://localhost:3010/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * purchasing-service re-validates the JWT itself). Supplier-portal auth
 * (`/api/purchasing/auth/*`, `PurchasingAuthProxyController`) and the
 * supplier portal itself (`/api/purchasing/portal/*`,
 * `PurchasingPortalProxyController`) each get their own narrowly-scoped
 * `@Public()` sub-route — purchasing-service's own `SupplierJwtGuard` is the
 * real gate on the portal one, same pattern as crm's customer-facing
 * storefront. Both are registered before this catch-all in
 * `PurchasingProxyModule`.
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/payments` 404 gap for payment-service; the same gap would otherwise
 * exist here for `GET /api/purchasing?...`).
 */
@Controller('purchasing')
export class PurchasingProxyController {
  private readonly purchasingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.purchasingBaseUrl = this.config
      .get<string>('PURCHASING_SERVICE_URL', 'http://localhost:3010/api')
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
      baseUrl: this.purchasingBaseUrl,
      matchPrefix: '/api/purchasing',
    });
  }
}
