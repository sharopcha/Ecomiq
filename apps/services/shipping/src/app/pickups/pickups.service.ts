import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Pickup, PickupStatus } from '../entities/pickup.entity';
import { Shipment } from '../entities/shipment.entity';
import {
  NOTIFY_SEND_COMMAND,
  SHIPPING_PICKUP_AGGREGATE_TYPE,
  ShippingPickupEventType,
} from '../events/shipping-event-types';
import { PickupInputDto } from './dto/bulk-schedule-pickup.dto';

@Injectable()
export class PickupsService {
  constructor(
    @InjectRepository(Pickup) private readonly repo: Repository<Pickup>,
    private readonly config: ConfigService,
  ) {}

  async findAll(storeId: string, query: PaginationQueryDto): Promise<PaginatedResult<Pickup>> {
    const qb = this.repo.createQueryBuilder('pickup').where('pickup.store_id = :storeId', { storeId });
    return paginate(qb, 'pickup', query);
  }

  async findOne(storeId: string, id: string): Promise<Pickup> {
    const pickup = await this.repo.findOne({ where: { id } });
    return assertOwnedByStore(pickup, storeId, () => new NotFoundException(`Pickup ${id} not found`));
  }

  /**
   * `POST /pickups/bulk` — the bulk Schedule Pickup modal. One row per
   * shipment, in one transaction: creates the `Pickup`, publishes
   * `shipping.pickup.scheduled`, and arms the self-consumed
   * `shipping.pickup.reminder_check` delayed message for pickup morning.
   */
  async scheduleBulk(storeId: string, inputs: PickupInputDto[]): Promise<Pickup[]> {
    return this.repo.manager.transaction(async (manager) => {
      const results: Pickup[] = [];

      for (const input of inputs) {
        const shipment = await manager.findOneBy(Shipment, { id: input.shipmentId, storeId });
        if (!shipment) {
          throw new NotFoundException(`Shipment ${input.shipmentId} not found`);
        }

        const pickup = manager.create(Pickup, {
          storeId,
          shipment,
          carrier: input.carrier,
          pickupDate: input.pickupDate,
          pickupTime: input.pickupTime ?? null,
          meridiem: input.meridiem ?? null,
          note: input.note ?? null,
          status: PickupStatus.Scheduled,
        });
        const saved = await manager.save(pickup);
        results.push(saved);

        await recordOutboxEvent(manager, {
          eventType: ShippingPickupEventType.PickupScheduled,
          storeId,
          aggregateType: SHIPPING_PICKUP_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: {
            pickupId: saved.id,
            shipmentId: shipment.id,
            carrier: saved.carrier,
            pickupDate: saved.pickupDate,
          },
        });

        await recordOutboxEvent(manager, {
          eventType: ShippingPickupEventType.PickupReminderCheck,
          storeId,
          aggregateType: SHIPPING_PICKUP_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: { pickupId: saved.id },
          deliverAt: pickupMorning(input.pickupDate),
        });
      }

      return results;
    });
  }

  /**
   * Consumer half of the reminder-check delayed message
   * (`PickupReminderController`). Still `scheduled` when it lands ->
   * emits `notify.send` (`template: 'pickup_reminder'`, a staff-facing
   * reminder — resolved server-side via `NOTIFICATION_STAFF_EMAIL`, no
   * customer recipient in this payload). `completed`/`canceled` -> no-op.
   */
  async handleReminderCheck(storeId: string, pickupId: string): Promise<void> {
    const pickup = await this.repo.findOne({ where: { id: pickupId }, relations: { shipment: true } });
    if (!pickup || pickup.status !== PickupStatus.Scheduled) return;

    await this.repo.manager.transaction(async (manager) => {
      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId,
        aggregateType: SHIPPING_PICKUP_AGGREGATE_TYPE,
        aggregateId: pickup.id,
        payload: {
          template: 'pickup_reminder',
          pickupId: pickup.id,
          shipmentId: pickup.shipment.id,
          carrier: pickup.carrier,
          pickupDate: pickup.pickupDate,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });
    });
  }
}

/** 8am UTC on the pickup date — a fixed, documented stand-in for "pickup morning" (no per-store timezone config exists yet). */
function pickupMorning(pickupDate: string): Date {
  return new Date(`${pickupDate}T08:00:00.000Z`);
}
