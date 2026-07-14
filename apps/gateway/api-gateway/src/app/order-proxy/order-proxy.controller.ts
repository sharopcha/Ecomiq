import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for order-service — all forwarding mechanics (raw body
 * passthrough, hop-by-hop header stripping, multi-value set-cookie, 3xx
 * relay, upstream timeout) live in the shared `proxyRequest` handler; this
 * controller only knows its own path-rewrite rule and base URL. Mirrors
 * `CatalogProxyController`/`InventoryProxyController`.
 *
 * order-service's own controllers are not prefixed with "orders" — the
 * gateway owns the `/api/orders/*` namespace, so `/api/orders/health`
 * strips down to `/health` before being appended to `ORDER_SERVICE_URL`
 * (`http://localhost:3004/api`).
 *
 * Deliberately *not* `@Public()` (zero-trust — order-service re-validates
 * the JWT itself via its own JwtAuthGuard). No public sub-routes exist on
 * order-service's namespace today — do not add `@Public()` to this
 * catch-all if one ever does; register a narrowly-scoped public
 * sub-controller *before* this one in the module instead (see
 * PaymentProxyModule/MarketingProxyModule's header comments for the
 * pattern already in place there).
 *
 * Two `@All()` routes, not one: `*path` (NestJS 11 / path-to-regexp 8's
 * named wildcard) only matches when at least one path segment follows the
 * base — it does **not** match the bare `/api/orders` itself. That's fine
 * for `/api/orders/health` or `/api/orders/:id`, but silently 404s
 * `GET /api/orders` (list) and `POST /api/orders` (create) — exactly the
 * two routes order-service's own bare-root `OrdersController` handles.
 * Found via a live gateway smoke test; the same gap
 * affects every sibling proxy controller (catalog/inventory/payment/
 * marketing) identically, all fixed alongside this one. `@All()` with no
 * argument matches the controller's exact base path and needs no separate
 * logic — `proxyRequest` derives the forwarded path from `req.url` itself,
 * not from a captured wildcard param.
 */
@Controller('orders')
export class OrderProxyController {
  private readonly orderBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.orderBaseUrl = this.config
      .get<string>('ORDER_SERVICE_URL', 'http://localhost:3004/api')
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
      baseUrl: this.orderBaseUrl,
      matchPrefix: '/api/orders',
    });
  }
}
