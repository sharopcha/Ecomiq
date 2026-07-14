import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { Shipment } from '../entities/shipment.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { shapeTrackingResponse, TrackingResponse } from './shape-tracking-response.util';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(Shipment) private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(TrackingNumber) private readonly trackingNumberRepo: Repository<TrackingNumber>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * `storeSlugOrId` is treated as a raw store id — this repo has no
   * existing cross-service slug-resolution path (identity-service's
   * `Store.slug` has no public lookup endpoint, and shipping-service has no
   * local `Store` entity of its own), so building one is out of scope for
   * this single public endpoint. Documented as a known gap rather than
   * inventing new cross-service infrastructure to serve a friendlier URL.
   */
  async getPublicTracking(storeSlugOrId: string, displayIdOrTracking: string): Promise<TrackingResponse> {
    const cacheKey = `shipping:track:${storeSlugOrId}:${displayIdOrTracking}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrackingResponse;
    }

    const shipment = await this.resolveShipment(storeSlugOrId, displayIdOrTracking);
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const events = [...(shipment.events ?? [])].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const shaped = shapeTrackingResponse(shipment, events);

    await this.redis.set(cacheKey, JSON.stringify(shaped), 'EX', CACHE_TTL_SECONDS);
    return shaped;
  }

  private async resolveShipment(storeId: string, displayIdOrTracking: string): Promise<Shipment | null> {
    const byDisplayId = await this.shipmentRepo.findOne({
      where: { storeId, displayId: displayIdOrTracking },
      relations: { events: true },
    });
    if (byDisplayId) return byDisplayId;

    const trackingNumber = await this.trackingNumberRepo.findOne({
      where: { value: displayIdOrTracking },
      relations: { fulfillment: true },
    });
    if (!trackingNumber) return null;

    return this.shipmentRepo.findOne({
      where: { storeId, fulfillmentId: trackingNumber.fulfillment.id },
      relations: { events: true },
    });
  }
}
