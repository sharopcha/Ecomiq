import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Fulfillment } from '../entities/fulfillment.entity';
import { FulfillmentLine } from '../entities/fulfillment-line.entity';
import { TrackingNumber } from '../entities/tracking-number.entity';
import { Shipment } from '../entities/shipment.entity';
import {
  NOTIFY_SEND_COMMAND,
  SHIPPING_FULFILLMENT_AGGREGATE_TYPE,
  ShippingFulfillmentEventType,
} from '../events/shipping-event-types';
import { CreateFulfillmentDto } from './dto/create-fulfillment.dto';

@Injectable()
export class FulfillmentsService {
  constructor(
    @InjectRepository(Fulfillment) private readonly repo: Repository<Fulfillment>,
    private readonly config: ConfigService,
  ) {}

  async findAll(storeId: string, query: PaginationQueryDto): Promise<PaginatedResult<Fulfillment>> {
    const qb = this.repo.createQueryBuilder('fulfillment').where('fulfillment.store_id = :storeId', { storeId });
    return paginate(qb, 'fulfillment', query);
  }

  async findOne(storeId: string, id: string): Promise<Fulfillment> {
    const fulfillment = await this.repo.findOne({
      where: { id },
      relations: { lines: true, trackingNumbers: true },
    });
    return assertOwnedByStore(fulfillment, storeId, () => new NotFoundException(`Fulfillment ${id} not found`));
  }

  async create(storeId: string, dto: CreateFulfillmentDto): Promise<Fulfillment> {
    return this.repo.manager.transaction(async (manager) => {
      const fulfillment = manager.create(Fulfillment, {
        storeId,
        orderId: dto.orderId,
        notifyCustomer: dto.notifyCustomer ?? false,
      });
      const saved = await manager.save(fulfillment);

      const lineRows = dto.lines.map((line) =>
        manager.create(FulfillmentLine, {
          fulfillment: saved,
          orderLineId: line.orderLineId,
          qty: line.qty,
          weightLb: line.weightLb ?? null,
        }),
      );
      saved.lines = await manager.save(lineRows);

      const trackingRows = dto.trackingNumbers.map((value) =>
        manager.create(TrackingNumber, { fulfillment: saved, value }),
      );
      saved.trackingNumbers = await manager.save(trackingRows);

      // Link shipment.fulfillment_id when a shipment for the order already
      // exists — a targeted update, not a save() of a relation-eager-loaded
      // Shipment (see ShipmentsService's doc comment on why that deletes
      // child rows).
      const shipment = await manager.findOne(Shipment, { where: { storeId, orderId: dto.orderId } });
      if (shipment) {
        await manager.update(Shipment, { id: shipment.id }, { fulfillmentId: saved.id });
      }

      await recordOutboxEvent(manager, {
        eventType: ShippingFulfillmentEventType.FulfillmentCreated,
        storeId,
        aggregateType: SHIPPING_FULFILLMENT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          fulfillmentId: saved.id,
          orderId: saved.orderId,
          lines: dto.lines.map((line) => ({ orderLineId: line.orderLineId, qty: line.qty })),
          trackingNumbers: dto.trackingNumbers,
        },
      });

      if (dto.notifyCustomer) {
        await recordOutboxEvent(manager, {
          eventType: NOTIFY_SEND_COMMAND,
          storeId,
          aggregateType: SHIPPING_FULFILLMENT_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: {
            template: 'shipment',
            orderId: saved.orderId,
            fulfillmentId: saved.id,
            trackingNumbers: dto.trackingNumbers,
            sendToCustomer: true,
            email: shipment?.contactEmail ?? null,
          },
          topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
        });
      }

      return saved;
    });
  }
}
