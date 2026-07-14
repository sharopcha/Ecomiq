import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `CrmProxyController`'s header comment
 * mentions: register/login/refresh/logout/jwks have no principal yet (or,
 * for refresh/logout, use crm's own rotating-cookie session, not a staff
 * JWT), so `/api/crm/auth/*` must be reachable without one. A
 * narrowly-scoped `@Public()` sub-route controller, registered *before* the
 * authenticated catch-all in `CrmProxyModule` so Nest's route resolution
 * picks this more specific path first — exact clone of shipping's
 * `ShippingWebhooksProxyController`/payment's
 * `PaymentWebhooksProxyController`. Do **not** make the whole
 * `CrmProxyModule` `@Public()` — every other crm route (customers, reviews,
 * ...) still needs the edge-level 401 for staff tokens.
 */
@Controller('crm/auth')
@Public()
export class CrmAuthProxyController {
  private readonly crmBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.crmBaseUrl = this.config
      .get<string>('CRM_SERVICE_URL', 'http://localhost:3009/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Still strips the full `/api/crm` prefix (not `/api/crm/auth`) — the
      // remainder (`/auth/register`, `/auth/jwks`, ...) is what crm-service's
      // own `AuthController`/`JwksController` (`@Controller('auth')`) expect.
      baseUrl: this.crmBaseUrl,
      matchPrefix: '/api/crm',
    });
  }
}
