import { Controller, Param, Post, Req, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '@temp-nx/auth';
import { FormsService } from './forms.service';

/**
 * `POST /api/marketing/forms/:id/submissions` — the one deliberate public
 * exception this service carries: storefront visitors submit forms
 * unauthenticated, no store context of their own. `@Public()` at the
 * class level (not mixed
 * into `FormsController`) — same dedicated-controller convention as
 * payment-service's `WebhooksController`. Heavily throttled (tighter than
 * identity's own client-credentials endpoint) since this is a public,
 * unauthenticated write surface.
 *
 * The request body is deliberately untyped (`Record<string, unknown>`, not
 * a class-validator DTO): there's no fixed shape to validate against here —
 * each form supplies its own JSON Schema, checked by `FormsService.submit()`
 * via `validateFormSubmission`. NestJS's global `ValidationPipe` only
 * validates `@Body()` parameters whose reflected type is a decorated class;
 * a plain `Record`/`Object`-typed parameter passes through untouched, which
 * is exactly what's needed here.
 */
@Controller('forms')
@Public()
export class FormSubmissionsController {
  constructor(private readonly forms: FormsService) {}

  @Post(':id/submissions')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(@Param('id') id: string, @Body() data: Record<string, unknown>, @Req() req: Request) {
    return this.forms.submit(id, data, req.ip);
  }
}
