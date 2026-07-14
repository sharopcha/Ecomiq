import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for crm-service — all forwarding mechanics (raw body
 * passthrough, hop-by-hop header stripping, multi-value set-cookie, 3xx
 * relay, upstream timeout) live in the shared `proxyRequest` handler; this
 * controller only knows its own path-rewrite rule and base URL. Mirrors
 * `NotificationProxyController`/`ShippingProxyController`.
 *
 * crm-service's own controllers are not prefixed with "crm" — the gateway
 * owns the `/api/crm/*` namespace, so `/api/crm/health` strips down to
 * `/health` before being appended to `CRM_SERVICE_URL`
 * (`http://localhost:3009/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * crm-service re-validates the JWT itself). Customer auth
 * (register/login/refresh/logout/jwks) and the customer-facing
 * `/storefront/*` surface each have their own narrowly-scoped `@Public()`
 * sub-route (`CrmAuthProxyController`/`CrmStorefrontProxyController`,
 * registered before this catch-all in `CrmProxyModule`).
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/payments` 404 gap for payment-service; the same gap would otherwise
 * exist here for `GET /api/crm?...`).
 */
@Controller('crm')
export class CrmProxyController {
  private readonly crmBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.crmBaseUrl = this.config
      .get<string>('CRM_SERVICE_URL', 'http://localhost:3009/api')
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
      baseUrl: this.crmBaseUrl,
      matchPrefix: '/api/crm',
    });
  }
}
