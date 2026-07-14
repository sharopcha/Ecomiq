import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';
import { Public } from '@temp-nx/auth';

/**
 * `/api/markets` — `@Public()`: identity's `Store` directory is genuinely
 * anonymous per §3.4 (no customer/staff auth of any kind).
 *
 * Two `@All()` routes, not one, same reasoning as every sibling proxy
 * controller (`CatalogProxyController`, `OrderProxyController`, etc.):
 * `*path` (NestJS 11 / path-to-regexp 8's named wildcard) only matches when
 * at least one path segment follows the base — it never matches the bare
 * `/api/markets` itself (the list endpoint), only `/api/markets/:slug`.
 * The old bare Express-4 wildcard (`'*'`) this controller previously used
 * doesn't register as a matching route pattern under path-to-regexp 8 at
 * all (confirmed live: `GET /api/markets` 404'd with "Cannot GET").
 */
@Controller('markets')
@Public()
export class MarketsProxyController {
  private readonly targetUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.targetUrl = this.configService
      // Was defaulted to :3000 (the gateway's own port) — copy-paste drift
      // from a template that pointed at itself. :3001 matches identity's
      // own port (auth-proxy.controller.ts's default), and every other
      // env-configured deployment (docker-compose) already overrides this
      // correctly regardless.
      .get<string>('IDENTITY_SERVICE_URL', 'http://localhost:3001/api')
      .replace(/\/$/, '');
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    return this.proxyMarkets(req, res);
  }

  @All('*path')
  async proxyMarkets(@Req() req: Request, @Res() res: Response) {
    await proxyRequest(req, res, {
      baseUrl: this.targetUrl,
      // identity-service's own `MarketsController` is *also*
      // `@Controller('markets')` — stripping the whole `/api/markets`
      // prefix and re-adding just `/markets` (same `matchPrefix`+
      // `replacement` idiom as `AuthProxyController`/
      // `OrderStorefrontProxyController`) preserves that segment for the
      // upstream call. Without `replacement`, `/api/markets` itself strips
      // to bare `/` and 404s against identity ("Cannot GET /api/" —
      // confirmed live), and `/api/markets/:slug` strips to `/:slug`,
      // missing the `markets` segment identity actually expects.
      matchPrefix: '/api/markets',
      replacement: '/markets',
    });
  }
}
