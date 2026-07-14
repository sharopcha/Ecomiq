import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for catalog-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base
 * URL.
 *
 * catalog-service's own controllers are *not* prefixed with "catalog"
 * (`@Controller('vendors')`, `@Controller('products')`, etc.,
 * mounted directly under catalog's own global "api" prefix) — the gateway
 * is what owns the `/api/catalog/*` namespace, not catalog-service itself.
 * So `/api/catalog/vendors` strips down to `/vendors` before being
 * appended to `CATALOG_SERVICE_URL` (`http://localhost:3002/api`), landing
 * on `http://localhost:3002/api/vendors` — vs. auth-proxy's
 * `/api/auth/login` -> `/auth/login` -> identity's own `/api/auth/login`,
 * since identity's AuthController *is* literally named 'auth'.
 *
 * Deliberately *not* `@Public()` (unlike auth-proxy): the
 * gateway's global JwtAuthGuard (JWKS-backed, same as catalog-service's own)
 * now rejects a missing/invalid token at the edge with a cheap 401 before
 * any upstream fetch. This is defense-in-depth, not a replacement —
 * catalog-service still verifies the JWT itself via its own JwtAuthGuard +
 * per-route PermissionsGuard (ADR-5 zero-trust is unchanged). If a future
 * *public* storefront route is ever added on catalog-service, this
 * controller will need a path allowlist checked inside the guard (or a
 * scoped `@Public()` on specific sub-paths) — not needed today, nothing
 * public exists here yet.
 *
 * Two `@All()` routes, not one: `*path` only matches when at least one
 * path segment follows `/catalog` — the bare `/api/catalog` itself 404s
 * (found via a live gateway smoke test;
 * the same gap existed in every sibling proxy controller, all fixed
 * together). `@All()` with no argument matches the exact base path;
 * `proxyRequest` derives the forwarded path from `req.url`, not a captured
 * wildcard param, so delegating to the same handler is safe.
 */
@Controller('catalog')
export class CatalogProxyController {
  private readonly catalogBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.catalogBaseUrl = this.config
      .get<string>('CATALOG_SERVICE_URL', 'http://localhost:3002/api')
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
      baseUrl: this.catalogBaseUrl,
      matchPrefix: '/api/catalog',
    });
  }
}
