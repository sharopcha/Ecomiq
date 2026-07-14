import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@temp-nx/typeorm';
import { ShippingLabel } from './shipping-label.entity';
import { PackagePreset } from './package-preset.entity';

/**
 * Per-item package: weight including packaging, dimensions, and the
 * "Combine Package" flag. Extends `BaseEntity` (id only, no `storeId`/
 * timestamps of its own) — like `order_line`, it has no independent
 * lifecycle or tenant column; it's always reached through its parent
 * `shipping_label` (`store_id` lives there). `orderLineId` is a plain
 * snapshot-reference column (order_line lives in order_db, ADR-2).
 */
@Entity('shipping_label_package')
export class ShippingLabelPackage extends BaseEntity {
  @ManyToOne(() => ShippingLabel, (label) => label.packages, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'label_id' })
  label!: ShippingLabel;

  @Column({ type: 'text', name: 'order_line_id', nullable: true })
  orderLineId?: string | null;

  @ManyToOne(() => PackagePreset, { nullable: true })
  @JoinColumn({ name: 'package_preset_id' })
  packagePreset?: PackagePreset | null;

  @Column({ type: 'text', name: 'package_name', nullable: true })
  packageName?: string | null;

  @Column({ type: 'text', name: 'package_type', nullable: true })
  packageType?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, name: 'item_weight_kg', nullable: true })
  itemWeightKg?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, name: 'total_weight_kg', nullable: true })
  totalWeightKg?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'length_cm', nullable: true })
  lengthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'width_cm', nullable: true })
  widthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'height_cm', nullable: true })
  heightCm?: number | null;

  @Column({ type: 'boolean', default: false })
  combined!: boolean;
}
