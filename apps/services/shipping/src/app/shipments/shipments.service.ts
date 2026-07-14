import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Shipment, ShipmentStatus } from '../entities/shipment.entity';
import { ShipmentEvent, ShipmentEventKind } from '../entities/shipment-event.entity';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { SHIPPING_SHIPMENT_AGGREGATE_TYPE, ShipmentEventType } from '../events/shipping-event-types';
import { canTransition } from './transition-guard.util';
import { stageForEventKind } from './stage-for-event-kind.util';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { CreateShipmentEventDto } from './dto/create-shipment-event.dto';

const SHIPMENT_SEQUENCE_KIND = 'shipment';

/** What a status transition writes to the timeline + publishes on the outbox — one entry per legal target status. */
const TRANSITION_EFFECT: Record<
  ShipmentStatus,
  { kind: ShipmentEventKind; description: string; eventType: string; stage: (current: number) => number } | null
> = {
  [ShipmentStatus.Draft]: null, // unreachable as a transition target (only the initial status)
  [ShipmentStatus.InProgress]: {
    kind: ShipmentEventKind.ConfirmShipment,
    description: 'Shipment confirmed',
    eventType: ShipmentEventType.ShipmentUpdated,
    stage: (current) => Math.max(current, 1),
  },
  [ShipmentStatus.Arrived]: {
    kind: ShipmentEventKind.Delivered,
    description: 'Shipment delivered',
    eventType: ShipmentEventType.ShipmentArrived,
    stage: () => 3,
  },
  [ShipmentStatus.Canceled]: {
    kind: ShipmentEventKind.Exception,
    description: 'Shipment canceled',
    eventType: ShipmentEventType.ShipmentCanceled,
    stage: (current) => current, // frozen wherever it was, same as order_status canceled rows
  },
};

@Injectable()
export class ShipmentsService {
  constructor(@InjectRepository(Shipment) private readonly repo: Repository<Shipment>) {}

  async create(storeId: string, dto: CreateShipmentDto): Promise<Shipment> {
    return this.repo.manager.transaction(async (manager) => {
      const seq = await claimNextSequenceNumber(manager, storeId, SHIPMENT_SEQUENCE_KIND);

      const shipment = manager.create(Shipment, {
        storeId,
        displayId: `SHP-${seq}`,
        orderId: dto.orderId,
        fulfillmentId: dto.fulfillmentId ?? null,
        carrier: dto.carrier ?? null,
        serviceType: dto.serviceType ?? null,
        shipDate: dto.shipDate ?? null,
        originAddress: dto.originAddress ?? null,
        destinationAddress: dto.destinationAddress ?? null,
        expectedArrivalAt: dto.expectedArrivalAt ? new Date(dto.expectedArrivalAt) : null,
        contactEmail: dto.contactEmail ?? null,
        status: ShipmentStatus.Draft,
        currentStage: 0,
      });
      const saved = await manager.save(shipment);

      const initialEvent = manager.create(ShipmentEvent, {
        shipment: saved,
        kind: ShipmentEventKind.OrderPlaced,
        description: 'Order placed',
        occurredAt: new Date(),
      });
      saved.events = [await manager.save(initialEvent)];

      await recordOutboxEvent(manager, {
        eventType: ShipmentEventType.ShipmentCreated,
        storeId,
        aggregateType: SHIPPING_SHIPMENT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async findAll(storeId: string, query: PaginationQueryDto): Promise<PaginatedResult<Shipment>> {
    const qb = this.repo.createQueryBuilder('shipment').where('shipment.store_id = :storeId', { storeId });
    return paginate(qb, 'shipment', query);
  }

  async findOne(storeId: string, id: string): Promise<Shipment> {
    const shipment = await this.repo.findOne({ where: { id }, relations: { events: true } });
    const owned = assertOwnedByStore(shipment, storeId, () => new NotFoundException(`Shipment ${id} not found`));
    owned.events = (owned.events ?? []).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return owned;
  }

  /** Idempotency check for the `orders.order.placed` auto-draft consumer — one shipment per order, first write wins. */
  async findByOrderId(storeId: string, orderId: string): Promise<Shipment | null> {
    return this.repo.findOne({ where: { storeId, orderId } });
  }

  /**
   * `POST /:id/transition` — target status is caller-specified (the plan's
   * own route shape); `canTransition` guards it. `carrierEventId`, when
   * given, stamps the timeline entry this creates for the tracking
   * webhook's idempotency (a redelivered "delivered" event must not
   * double-transition).
   */
  async transition(storeId: string, id: string, target: ShipmentStatus, carrierEventId?: string): Promise<Shipment> {
    const shipment = await this.findOne(storeId, id);
    const guard = canTransition(shipment.status, target);
    // `=== false` narrowing only — repo rule (tsconfig.base.json has no strictNullChecks).
    if (guard.ok === false) {
      throw new ConflictException(`Shipment ${id} cannot transition from ${shipment.status} to ${target}`);
    }
    const effect = TRANSITION_EFFECT[target];
    if (!effect) {
      throw new ConflictException(`Shipment ${id} cannot transition to ${target}`);
    }

    return this.repo.manager.transaction(async (manager) => {
      // Targeted column update, not `manager.save(shipment)` — `shipment`
      // still carries its (about-to-be-stale) `events` array from the
      // `findOne()` above, and TypeORM reconciles a populated `OneToMany`
      // collection against the DB on save *even without `cascade`* —
      // saving the whole entity here would delete the event this same
      // transaction is about to insert, since it isn't in that array yet.
      const newStage = effect.stage(shipment.currentStage);
      await manager.update(Shipment, { id: shipment.id }, { status: target, currentStage: newStage });
      shipment.status = target;
      shipment.currentStage = newStage;

      const event = manager.create(ShipmentEvent, {
        shipment,
        kind: effect.kind,
        description: effect.description,
        occurredAt: new Date(),
        carrierEventId: carrierEventId ?? null,
      });
      shipment.events = [...(shipment.events ?? []), await manager.save(event)];

      await recordOutboxEvent(manager, {
        eventType: effect.eventType,
        storeId,
        aggregateType: SHIPPING_SHIPMENT_AGGREGATE_TYPE,
        aggregateId: shipment.id,
        payload: this.toEventPayload(shipment),
      });

      // Arms the delay-check self-message the moment a shipment starts
      // actually shipping — only meaningful once, since `in_progress` is
      // reached exactly once per shipment (the status machine never
      // revisits it). If `expectedArrivalAt` changes after this point
      // there is currently no update path that re-arms the check —
      // shipping-service has no generic PATCH /shipments/:id endpoint,
      // only the narrow create/transition/events/delay surface.
      if (target === ShipmentStatus.InProgress && shipment.expectedArrivalAt) {
        await recordOutboxEvent(manager, {
          eventType: ShipmentEventType.ShipmentDelayCheck,
          storeId,
          aggregateType: SHIPPING_SHIPMENT_AGGREGATE_TYPE,
          aggregateId: shipment.id,
          payload: { shipmentId: shipment.id },
          deliverAt: shipment.expectedArrivalAt,
        });
      }

      return shipment;
    });
  }

  cancel(storeId: string, id: string): Promise<Shipment> {
    return this.transition(storeId, id, ShipmentStatus.Canceled);
  }

  /**
   * Consumer half of the delay-check delayed message
   * (`DelayCheckController`). Reloads fresh — a shipment that reached
   * `arrived`/`canceled` before the delayed message landed is a silent
   * no-op (state-check precedent, same shape as order's
   * `handlePaymentTimeout`); already `isDelayed` is likewise a no-op
   * (idempotent against redelivery).
   */
  async handleDelayCheck(storeId: string, shipmentId: string): Promise<void> {
    const shipment = await this.repo.findOne({ where: { id: shipmentId } });
    if (!shipment) return;
    if (shipment.status === ShipmentStatus.Arrived || shipment.status === ShipmentStatus.Canceled) return;
    if (shipment.isDelayed) return;

    await this.markDelayed(storeId, shipment, 'Expected arrival passed');
  }

  /** `POST /:id/delay` — manual delay (the UI's Delay badge). Idempotent: already delayed is a no-op; a terminal shipment can't be delayed. */
  async delay(storeId: string, id: string, reason: string): Promise<Shipment> {
    const shipment = await this.findOne(storeId, id);
    if (shipment.status === ShipmentStatus.Arrived || shipment.status === ShipmentStatus.Canceled) {
      throw new ConflictException(`Shipment ${id} is ${shipment.status} and cannot be marked delayed`);
    }
    if (shipment.isDelayed) {
      return shipment;
    }

    await this.markDelayed(storeId, shipment, reason);
    shipment.isDelayed = true;
    shipment.delayReason = reason;
    return shipment;
  }

  private async markDelayed(storeId: string, shipment: Shipment, reason: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      await manager.update(Shipment, { id: shipment.id }, { isDelayed: true, delayReason: reason });
      await recordOutboxEvent(manager, {
        eventType: ShipmentEventType.ShipmentDelayed,
        storeId,
        aggregateType: SHIPPING_SHIPMENT_AGGREGATE_TYPE,
        aggregateId: shipment.id,
        payload: {
          shipmentId: shipment.id,
          orderId: shipment.orderId,
          displayId: shipment.displayId,
          delayReason: reason,
          // additive — notification-service's delay-email consumer needs a
          // real recipient, same "extend a producer's payload additively
          // when a real consumer needs it" precedent as return.approved's
          // `email` field.
          contactEmail: shipment.contactEmail ?? null,
        },
      });
    });
  }

  /**
   * `POST /:id/events` — manual timeline entry. Bumps `currentStage` if the
   * kind implies more progress than the shipment already shows; never
   * emits an outbox event (only status transitions do). `carrierEventId`
   * is only ever supplied by the tracking webhook, never the public REST
   * DTO — its idempotency stamp.
   */
  async addEvent(
    storeId: string,
    id: string,
    dto: CreateShipmentEventDto,
    carrierEventId?: string,
  ): Promise<ShipmentEvent> {
    const shipment = await this.findOne(storeId, id);

    return this.repo.manager.transaction(async (manager) => {
      const event = manager.create(ShipmentEvent, {
        shipment,
        kind: dto.kind,
        description: dto.description ?? null,
        location: dto.location ?? null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        carrierEventId: carrierEventId ?? null,
      });
      const savedEvent = await manager.save(event);

      // `manager.update()`, not `manager.save(shipment)` — see the doc
      // comment in `transition()` above for why re-saving the whole
      // relation-laden entity here would delete the row just inserted.
      const impliedStage = stageForEventKind(dto.kind);
      if (impliedStage !== null && impliedStage > shipment.currentStage) {
        await manager.update(Shipment, { id: shipment.id }, { currentStage: impliedStage });
      }

      return savedEvent;
    });
  }

  /** Event-carried-state-transfer snapshot — mirrors ShippingLabel's purchase-event payload shape. */
  private toEventPayload(shipment: Shipment): Record<string, unknown> {
    return {
      shipmentId: shipment.id,
      storeId: shipment.storeId,
      displayId: shipment.displayId,
      orderId: shipment.orderId,
      status: shipment.status,
      currentStage: shipment.currentStage,
      contactEmail: shipment.contactEmail ?? null,
    };
  }
}
