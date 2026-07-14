import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** Matches the `order_channel_type` Postgres enum. */
export enum OrderChannelType {
  OnlineStore = 'online_store',
  Pos = 'pos',
  Manual = 'manual',
  Marketplace = 'marketplace',
  MobileApp = 'mobile_app',
}

@Entity('channel')
export class Channel extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({
    type: 'enum',
    enum: OrderChannelType,
    enumName: 'order_channel_type',
    default: OrderChannelType.OnlineStore,
  })
  kind!: OrderChannelType;
}
