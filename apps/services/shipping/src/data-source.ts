import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { PackagePreset } from './app/entities/package-preset.entity';
import { ShippingLabel } from './app/entities/shipping-label.entity';
import { ShippingLabelPackage } from './app/entities/shipping-label-package.entity';
import { Shipment } from './app/entities/shipment.entity';
import { ShipmentEvent } from './app/entities/shipment-event.entity';
import { StoreSequence } from './app/entities/store-sequence.entity';
import { Fulfillment } from './app/entities/fulfillment.entity';
import { FulfillmentLine } from './app/entities/fulfillment-line.entity';
import { TrackingNumber } from './app/entities/tracking-number.entity';
import { Pickup } from './app/entities/pickup.entity';
import { ShipmentNotification } from './app/entities/shipment-notification.entity';

loadEnv();

/**
 * Single source of truth for TypeORM config, used both by NestJS
 * (TypeOrmModule.forRoot in app.module.ts) and by the TypeORM CLI for
 * migrations — mirrors apps/services/notification/src/data-source.ts:
 *
 *   npx typeorm-ts-node-commonjs migration:run -d apps/services/shipping/src/data-source.ts
 *   npx typeorm-ts-node-commonjs migration:generate -d apps/services/shipping/src/data-source.ts apps/services/shipping/src/app/migrations/<Name>
 *
 * `entities` starts with `OutboxMessage`; every domain entity (package_preset,
 * shipping_label, shipment, fulfillment, ...) gets appended here and only
 * here as later steps land — repo rule: every new entity must be added to
 * this array, not just a module's TypeOrmModule.forFeature.
 *
 * `synchronize` is hard-`false` unconditionally (notification-service's
 * precedent, not catalog/inventory/payment's `!isProduction`) — every schema
 * change goes through a hand-written migration from day one.
 */
export const shippingDataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.SHIPPING_DB_HOST ?? 'localhost',
  port: Number(process.env.SHIPPING_DB_PORT ?? 5432),
  username: process.env.SHIPPING_DB_USER ?? 'ecomiq',
  password: process.env.SHIPPING_DB_PASSWORD ?? 'ecomiq',
  database: process.env.SHIPPING_DB_NAME ?? 'shipping_db',
  entities: [
    OutboxMessage,
    PackagePreset,
    ShippingLabel,
    ShippingLabelPackage,
    Shipment,
    ShipmentEvent,
    StoreSequence,
    Fulfillment,
    FulfillmentLine,
    TrackingNumber,
    Pickup,
    ShipmentNotification,
  ],
  migrations: [__dirname + '/app/migrations/*.{ts,js}'],
  synchronize: false,
  namingStrategy: undefined, // columns are explicitly snake_case via @Column({ name })
};

export default new DataSource(shippingDataSourceOptions);
