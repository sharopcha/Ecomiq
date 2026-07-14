import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import { ShipmentEvent } from '../entities/shipment-event.entity';
import { ShipmentsService } from '../shipments/shipments.service';
import { CarrierTrackingWebhookEvent } from './tracking-webhook-event';
import { resolveTrackingKindEffect } from './kind-mapping.util';

@Injectable()
export class TrackingWebhookService {
  private readonly logger = new Logger(TrackingWebhookService.name);

  constructor(
    @InjectRepository(TrackingNumber) private readonly trackingRepo: Repository<TrackingNumber>,
    @InjectRepository(Shipment) private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(ShipmentEvent) private readonly eventRepo: Repository<ShipmentEvent>,
    private readonly shipments: ShipmentsService,
  ) {}

  /**
   * Carriers retry-storm on 4xx/5xx (same forwarding-failure reasoning as
   * notification's webhook dispatch) — every "nothing to do" branch here
   * logs and returns rather than throwing, so the controller always
   * acks 200.
   */
  async handle(event: CarrierTrackingWebhookEvent): Promise<void> {
    const effect = resolveTrackingKindEffect(event.kind);
    if (effect.action === 'ignore') {
      this.logger.log(`tracking webhook: unrecognized kind "${event.kind}" (eventId=${event.eventId}) — ack + ignore`);
      return;
    }

    const tracking = await this.trackingRepo.findOne({
      where: { value: event.trackingNumber },
      relations: { fulfillment: true },
    });
    if (!tracking) {
      this.logger.log(`tracking webhook: unknown tracking number "${event.trackingNumber}" — ack + ignore`);
      return;
    }

    const shipment = await this.shipmentRepo.findOne({ where: { fulfillmentId: tracking.fulfillment.id } });
    if (!shipment) {
      this.logger.log(
        `tracking webhook: tracking number "${event.trackingNumber}" has no linked shipment — ack + ignore`,
      );
      return;
    }

    const existing = await this.eventRepo.findOne({ where: { carrierEventId: event.eventId } });
    if (existing) {
      this.logger.log(`tracking webhook: event ${event.eventId} already processed — ack + no-op`);
      return;
    }

    if (effect.action === 'transition_arrived') {
      await this.shipments.transition(shipment.storeId, shipment.id, ShipmentStatus.Arrived, event.eventId);
    } else {
      await this.shipments.addEvent(
        shipment.storeId,
        shipment.id,
        { kind: effect.kind, description: event.description, location: event.location, occurredAt: event.occurredAt },
        event.eventId,
      );
    }
  }
}
