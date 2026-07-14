import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `shipment` + `shipment_event` per the data model, plus additive
 * `contact_email` on `shipment` (see `shipment.entity.ts`'s doc comment).
 * `store_sequence` mints `SHP-<n>` display ids — order-service's `RMA-<n>`
 * precedent, its own local copy per ADR-2.
 */
export class AddShipmentAndStoreSequence1783800000030 implements MigrationInterface {
  name = 'AddShipmentAndStoreSequence1783800000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE shipment_status AS ENUM ('draft', 'in_progress', 'arrived', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TYPE shipment_event_kind AS ENUM ('order_placed', 'preparing_to_ship', 'confirm_shipment', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception')`,
    );

    await queryRunner.query(`
      CREATE TABLE shipment (
        id                    text PRIMARY KEY,
        store_id              text NOT NULL,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        display_id            text NOT NULL,
        order_id              text NOT NULL,
        fulfillment_id        text,
        status                shipment_status NOT NULL DEFAULT 'draft',
        is_delayed            boolean NOT NULL DEFAULT false,
        delay_reason          text,
        carrier               text,
        service_type          text,
        ship_date             date,
        origin_address        jsonb,
        destination_address   jsonb,
        departure_at          timestamptz,
        expected_arrival_at   timestamptz,
        total_time_interval   interval,
        current_stage         smallint NOT NULL DEFAULT '0'::smallint,
        contact_email         text,
        UNIQUE (store_id, display_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX shipment_store_id_idx ON shipment (store_id)`);
    await queryRunner.query(`CREATE INDEX shipment_order_id_idx ON shipment (order_id)`);

    await queryRunner.query(`
      CREATE TABLE shipment_event (
        id            text PRIMARY KEY,
        shipment_id   text NOT NULL REFERENCES shipment(id) ON DELETE CASCADE,
        kind          shipment_event_kind NOT NULL,
        description   text,
        location      text,
        occurred_at   timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX shipment_event_shipment_id_idx ON shipment_event (shipment_id)`);

    await queryRunner.query(`
      CREATE TABLE store_sequence (
        store_id   text NOT NULL,
        kind       text NOT NULL,
        next_value int NOT NULL DEFAULT 1,
        PRIMARY KEY (store_id, kind)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS store_sequence`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipment_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipment`);
    await queryRunner.query(`DROP TYPE IF EXISTS shipment_event_kind`);
    await queryRunner.query(`DROP TYPE IF EXISTS shipment_status`);
  }
}
