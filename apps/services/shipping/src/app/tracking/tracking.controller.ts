import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import { TrackingService } from './tracking.service';
import { TrackingResponse } from './shape-tracking-response.util';

/**
 * The one genuinely public, unauthenticated surface in shipping-service — a
 * stranger with a display id or tracking number, no JWT. `@Throttle`
 * (not `@SkipThrottle()`) deliberately keeps the global `ThrottlerGuard` in
 * effect here with a tighter-than-default limit, same "credential/enum
 * guessing surface" reasoning as identity's `POST /auth/token` — this is
 * the only route in this controller and in this service where an anonymous
 * caller can enumerate other stores' shipments by guessing display ids.
 */
@Controller('track')
@Public()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':storeSlugOrId/:displayIdOrTracking')
  async track(
    @Param('storeSlugOrId') storeSlugOrId: string,
    @Param('displayIdOrTracking') displayIdOrTracking: string,
  ): Promise<TrackingResponse> {
    return this.tracking.getPublicTracking(storeSlugOrId, displayIdOrTracking);
  }
}
