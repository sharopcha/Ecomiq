import { Column, Entity } from 'typeorm';
import { TenantScopedEntity } from '@temp-nx/typeorm';

/** "Save this package for future use" — a reusable box/carrier-package shape offered when drafting a label. */
@Entity('package_preset')
export class PackagePreset extends TenantScopedEntity {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', name: 'package_type', nullable: true })
  packageType?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, name: 'weight_kg', nullable: true })
  weightKg?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'length_cm', nullable: true })
  lengthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'width_cm', nullable: true })
  widthCm?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'height_cm', nullable: true })
  heightCm?: number | null;
}
