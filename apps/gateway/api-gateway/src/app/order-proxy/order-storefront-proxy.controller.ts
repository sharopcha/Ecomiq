import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';
import { Public } from '@temp-nx/auth';

/**
 * `/api/storefront/orders/*` — `@Public()` in the crm-storefront sense
 * (`CrmStorefrontProxyController`'s doc comment): order-service's own
 * `StorefrontController` enforces the customer JWT via `@CustomerAuth()`,
 * the gateway just needs to stop its staff-only guard from rejecting the
 * request first. Catch-all + bare root, same pattern as
 * `CrmStorefrontProxyController`/`CatalogStorefrontProxyController` — this
 * used to hand-list only `POST compose`, which silently 404'd `GET
 * my-orders`/`my-orders/:id`/`my-orders/:id/status` at the gateway even
 * though order-service served them.
 */
@Controller('storefront/orders')
@Public()
export class OrderStorefrontProxyController {
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

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.orderBaseUrl,
      // order-service's own controller lives at `@Controller('storefront')`
      // — matchPrefix strips down to the bare path, `replacement` re-adds
      // the `storefront` segment order-service actually expects (same
      // pattern as auth-proxy).
      matchPrefix: '/api/storefront/orders',
      replacement: '/storefront',
    });
  }
}
