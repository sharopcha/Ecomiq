import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `PurchasingProxyController`'s header comment
 * will note once the portal sub-route also exists (Step 12):
 * register/login/refresh/logout/jwks have no principal yet (or, for
 * refresh/logout, use purchasing's own rotating-cookie session, not a staff
 * JWT), so `/api/purchasing/auth/*` must be reachable without one. A
 * narrowly-scoped `@Public()` sub-route controller, registered *before* the
 * authenticated catch-all in `PurchasingProxyModule` so Nest's route
 * resolution picks this more specific path first — exact clone of crm's
 * `CrmAuthProxyController`. Do **not** make the whole `PurchasingProxyModule`
 * `@Public()` — every other purchasing route (suppliers, purchase orders,
 * ...) still needs the edge-level 401 for staff tokens.
 */
@Controller('purchasing/auth')
@Public()
export class PurchasingAuthProxyController {
  private readonly purchasingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.purchasingBaseUrl = this.config
      .get<string>('PURCHASING_SERVICE_URL', 'http://localhost:3010/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Still strips the full `/api/purchasing` prefix (not
      // `/api/purchasing/auth`) — the remainder (`/auth/register`,
      // `/auth/jwks`, ...) is what purchasing-service's own
      // `AuthController`/`JwksController` (`@Controller('auth')`) expect.
      baseUrl: this.purchasingBaseUrl,
      matchPrefix: '/api/purchasing',
    });
  }
}
