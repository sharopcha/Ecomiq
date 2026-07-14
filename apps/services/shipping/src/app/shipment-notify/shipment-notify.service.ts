import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { ShipmentNotification } from '../entities/shipment-notification.entity';
import { Shipment } from '../entities/shipment.entity';
import { NOTIFY_SEND_COMMAND, SHIPPING_SHIPMENT_NOTIFICATION_AGGREGATE_TYPE } from '../events/shipping-event-types';
import { NotifyShipmentDto } from './dto/notify-shipment.dto';

@Injectable()
export class ShipmentNotifyService {
  constructor(
    @InjectRepository(ShipmentNotification) private readonly repo: Repository<ShipmentNotification>,
    private readonly config: ConfigService,
  ) {}

  /**
   * `POST /shipments/:id/notify` — the Shipment Notification composer.
   * Records a `queued` row and emits `notify.send` (`template: 'shipment'`)
   * onto marketing's `notify.commands` topic — same explicit `topic`
   * override precedent as `LabelsService`'s/`FulfillmentsService`'s own
   * `notify.send` emissions. The caller (`ShipmentNotifyController`) has
   * already verified the parent shipment exists and belongs to this store.
   */
  async create(storeId: string, shipmentId: string, dto: NotifyShipmentDto): Promise<ShipmentNotification> {
    return this.repo.manager.transaction(async (manager) => {
      const notification = manager.create(ShipmentNotification, {
        storeId,
        shipment: { id: shipmentId } as Shipment,
        channel: dto.channel,
        toAddress: dto.toAddress,
        subject: dto.subject ?? null,
        body: dto.body ?? null,
        templateId: dto.templateId ?? null,
        status: 'queued',
      });
      const saved = await manager.save(notification);

      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId,
        aggregateType: SHIPPING_SHIPMENT_NOTIFICATION_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          template: 'shipment',
          shipmentId,
          channel: dto.channel,
          to: dto.toAddress,
          subject: dto.subject ?? null,
          body: dto.body ?? null,
          templateId: dto.templateId ?? null,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });

      return saved;
    });
  }
}
