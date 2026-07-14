import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for marketing-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base URL.
 * Mirrors `CatalogProxyController`/`InventoryProxyController`.
 *
 * marketing-service's own controllers are not prefixed with "marketing" —
 * the gateway owns the `/api/marketing/*` namespace, so
 * `/api/marketing/health` strips down to `/health` before being appended to
 * `MARKETING_SERVICE_URL` (`http://localhost:3006/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * marketing-service re-validates the JWT itself). One deliberate exception:
 * `/api/marketing/forms/:id/submissions` is public (storefront visitors
 * submit forms unauthenticated) — handled by the narrowly-scoped
 * `MarketingFormsPublicProxyController`, registered *before* this catch-all
 * in `MarketingProxyModule` so Nest's route-matching picks the more
 * specific path first. Every other marketing route, including the rest of
 * `/forms/*` (CRUD), still falls through to this authenticated catch-all.
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/marketing` 404 gap, identical across every sibling proxy).
 */
@Controller('marketing')
export class MarketingProxyController {
  private readonly marketingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.marketingBaseUrl = this.config
      .get<string>('MARKETING_SERVICE_URL', 'http://localhost:3006/api')
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
      baseUrl: this.marketingBaseUrl,
      matchPrefix: '/api/marketing',
    });
  }
}
