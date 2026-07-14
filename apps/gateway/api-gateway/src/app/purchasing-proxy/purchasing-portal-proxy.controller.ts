import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * Third `@Public()` exception alongside `PurchasingAuthProxyController`:
 * `/api/purchasing/portal/*` is authenticated by a *supplier* JWT
 * (purchasing-service's own `SupplierJwtGuard`, verified against
 * purchasing's own JWKS), which the gateway's staff-only `JwtAuthGuard`
 * would always reject — wrong strategy, wrong JWKS, wrong issuer. "Public"
 * here means "the gateway doesn't gate it," not "unauthenticated" —
 * purchasing-service still requires a valid supplier token on every one of
 * these routes. Registered before the authenticated catch-all in
 * `PurchasingProxyModule`. Exact clone of crm's
 * `CrmStorefrontProxyController`.
 */
@Controller('purchasing/portal')
@Public()
export class PurchasingPortalProxyController {
  private readonly purchasingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.purchasingBaseUrl = this.config
      .get<string>('PURCHASING_SERVICE_URL', 'http://localhost:3010/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.purchasingBaseUrl,
      matchPrefix: '/api/purchasing',
    });
  }
}
