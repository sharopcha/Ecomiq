import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '@temp-nx/auth';
import { FilesService } from './files.service';
import { TransformImageQueryDto } from './dto/transform-image-query.dto';

// 5 minutes — comfortably inside the default 15-minute presign expiry, so
// a client never caches a redirect past the point where the URL it points
// at would itself already have expired.
const PUBLIC_CACHE_CONTROL = 'public, max-age=300';

/**
 * Unauthenticated by design (`@Public()`, no `@SkipThrottle()` — the
 * default per-IP throttler still applies, same as every other `@Public()`
 * route in this repo). What storefront PDPs embed for
 * `product_image.file_id`: the store is resolved from the `file_asset` row
 * itself (`FilesService.findPublicAsset`), not from a JWT, since there
 * isn't one. No listing, no search — id-addressed only, unguessable ULIDs
 * are the access token (ECOMIQ-DATA-MODEL.md's "nothing sensitive" note on
 * this table). A stranger with a guessed/enumerated id learns nothing more
 * than what a public product image already reveals.
 */
@Controller('public/files')
@Public()
export class PublicFilesController {
  constructor(private readonly files: FilesService) {}

  @Get(':id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const url = await this.files.getPublicDownloadUrl(id);
    res.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    res.redirect(url);
  }

  @Get(':id/image')
  async serveImage(
    @Param('id') id: string,
    @Query() query: TransformImageQueryDto,
    @Res() res: Response,
  ) {
    const url = await this.files.getPublicImageRedirectUrl(id, query);
    res.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    res.redirect(url);
  }
}
