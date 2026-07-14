import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * Second `@Public()` exception alongside `CrmAuthProxyController`:
 * `/api/crm/storefront/*` is authenticated by a *customer* JWT
 * (crm-service's own `CustomerJwtGuard`, verified against crm's own JWKS),
 * which the gateway's staff-only `JwtAuthGuard` would always reject —
 * wrong strategy, wrong JWKS, wrong issuer. "Public" here means "the
 * gateway doesn't gate it," not "unauthenticated" — crm-service still
 * requires a valid customer token on every one of these routes.
 * Registered before the authenticated catch-all in `CrmProxyModule`.
 */
@Controller('crm/storefront')
@Public()
export class CrmStorefrontProxyController {
  private readonly crmBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.crmBaseUrl = this.config
      .get<string>('CRM_SERVICE_URL', 'http://localhost:3009/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.crmBaseUrl,
      matchPrefix: '/api/crm',
    });
  }
}
