import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * `MediaProxyController`'s header comment flags this the same way
 * shipping's tracking page and purchasing's supplier portal are flagged:
 * a storefront PDP rendering `product_image.file_id` carries no JWT.
 * Narrowly scoped to `/media/public/*` only — every other media route still
 * needs the edge-level 401. media-service's own `GET /public/files/:id`
 * route (Step 8) is unauthenticated by design (id-addressed, unguessable
 * ULIDs are the access token per the data model's "nothing sensitive"
 * note) — the gateway just has to not 401 it first. Rate limiting is still
 * enforced (media-service's own throttler default applies, no
 * `@SkipThrottle()`), same as shipping's public tracking route.
 */
@Controller('media/public')
@Public()
export class MediaPublicProxyController {
  private readonly mediaBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.mediaBaseUrl = this.config
      .get<string>('MEDIA_SERVICE_URL', 'http://localhost:3011/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Strips the full `/api/media` prefix — the remainder
      // (`/public/files/:id`, `/public/files/:id/image`) is what
      // media-service's own public controller (Step 8) expects.
      baseUrl: this.mediaBaseUrl,
      matchPrefix: '/api/media',
    });
  }
}
