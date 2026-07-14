import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `pickup`, `shipment_notification` per the data model. Both `shipment_id`
 * FKs are same-DB (shipment/pickup/shipment_notification all live in
 * shipping_db).
 */
export class AddPickupAndShipmentNotification1783800000060 implements MigrationInterface {
  name = 'AddPickupAndShipmentNotification1783800000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE pickup_status AS ENUM ('scheduled', 'completed', 'canceled')`);
    await queryRunner.query(`CREATE TYPE notif_channel AS ENUM ('inbox_whatsapp', 'email', 'sms')`);

    await queryRunner.query(`
      CREATE TABLE pickup (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        shipment_id  text NOT NULL REFERENCES shipment(id),
        carrier      text NOT NULL,
        pickup_date  date NOT NULL,
        pickup_time  time,
        meridiem     text,
        note         text,
        status       pickup_status NOT NULL DEFAULT 'scheduled'
      )
    `);
    await queryRunner.query(`CREATE INDEX pickup_store_id_idx ON pickup (store_id)`);
    await queryRunner.query(`CREATE INDEX pickup_shipment_id_idx ON pickup (shipment_id)`);

    await queryRunner.query(`
      CREATE TABLE shipment_notification (
        id           text PRIMARY KEY,
        store_id     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        shipment_id  text NOT NULL REFERENCES shipment(id),
        channel      notif_channel NOT NULL,
        to_address   text NOT NULL,
        subject      text,
        body         text,
        template_id  text,
        sent_at      timestamptz,
        status       text NOT NULL DEFAULT 'queued'
      )
    `);
    await queryRunner.query(`CREATE INDEX shipment_notification_store_id_idx ON shipment_notification (store_id)`);
    await queryRunner.query(
      `CREATE INDEX shipment_notification_shipment_id_idx ON shipment_notification (shipment_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shipment_notification`);
    await queryRunner.query(`DROP TABLE IF EXISTS pickup`);
    await queryRunner.query(`DROP TYPE IF EXISTS notif_channel`);
    await queryRunner.query(`DROP TYPE IF EXISTS pickup_status`);
  }
}
