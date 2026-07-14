import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';
import { Shipment } from './shipment.entity';

export enum NotifChannel {
  InboxWhatsapp = 'inbox_whatsapp',
  Email = 'email',
  Sms = 'sms',
}

/**
 * Shipment Notification modal (WhatsApp/Email/SMS composer). `status` is a
 * plain text column, not an enum — matches the DDL literally (unlike
 * `pickup.status`, which is a real Postgres enum).
 */
@Entity('shipment_notification')
export class ShipmentNotification extends TenantScopedEntity {
  @Index()
  @ManyToOne(() => Shipment, { nullable: false })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: Shipment;

  @Column({ type: 'enum', enum: NotifChannel, enumName: 'notif_channel' })
  channel!: NotifChannel;

  @Column({ type: 'text', name: 'to_address' })
  toAddress!: string;

  @Column({ type: 'text', nullable: true })
  subject?: string | null;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  @Column({ type: 'text', name: 'template_id', nullable: true })
  templateId?: string | null;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'text', default: 'queued' })
  status!: string;
}
