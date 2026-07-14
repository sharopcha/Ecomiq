import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for inventory-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base
 * URL.
 *
 * inventory-service's own controllers (`@Controller('stock-levels')`,
 * `@Controller('locations')`, `@Controller('stock-movements')`,
 * `@Controller('stock-audits')`, `@Controller('stock-alerts')`,
 * `@Controller('reservations')`, `@Controller('reorder-rules')`) are *not*
 * prefixed with "inventory" — the gateway is what owns the
 * `/api/inventory/*` namespace, so `/api/inventory/stock-levels` strips
 * down to `/stock-levels` before being appended to `INVENTORY_SERVICE_URL`
 * (`http://localhost:3003/api`), landing on
 * `http://localhost:3003/api/stock-levels`.
 *
 * Deliberately *not* `@Public()` (unlike auth-proxy): see the
 * matching comment in `CatalogProxyController` for the full rationale
 * (cheap edge 401, defense-in-depth only, future public-route bypass list
 * if ever needed — not needed today).
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/inventory` 404 gap, identical across every sibling proxy).
 */
@Controller('inventory')
export class InventoryProxyController {
  private readonly inventoryBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.inventoryBaseUrl = this.config
      .get<string>('INVENTORY_SERVICE_URL', 'http://localhost:3003/api')
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
      baseUrl: this.inventoryBaseUrl,
      matchPrefix: '/api/inventory',
    });
  }
}
