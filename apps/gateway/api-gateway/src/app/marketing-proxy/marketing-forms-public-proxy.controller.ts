import { Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `MarketingProxyController`'s header comment
 * documents: storefront visitors
 * submit forms without a user JWT, so `/api/marketing/forms/:id/submissions`
 * must be reachable without one. A narrowly-scoped `@Public()` sub-route
 * controller, registered *before* the authenticated catch-all in
 * `MarketingProxyModule` so Nest's route resolution picks this more
 * specific path first — same pattern as `PaymentWebhooksProxyController`.
 * Every other `/api/marketing/forms/*` route (CRUD) still goes through the
 * catch-all and gets the edge-level 401; marketing-service's own
 * `FormSubmissionsController` re-validates this route is public on its side
 * too (zero-trust — the gateway's `@Public()` is not the only thing
 * standing between an unauthenticated caller and this endpoint).
 */
@Controller('marketing/forms')
@Public()
export class MarketingFormsPublicProxyController {
  private readonly marketingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.marketingBaseUrl = this.config
      .get<string>('MARKETING_SERVICE_URL', 'http://localhost:3006/api')
      .replace(/\/$/, '');
  }

  @Post(':id/submissions')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.marketingBaseUrl,
      matchPrefix: '/api/marketing',
    });
  }
}
