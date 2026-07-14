import { toMinorUnits } from '@temp-nx/typeorm';
import { Product } from '../entities/product.entity';

export interface PricingInput {
  price?: number;
  compareAtPrice?: number;
  cost?: number;
  wholesaleMin?: number;
  wholesaleMax?: number;
}

/**
 * Converts whatever major-unit pricing fields are present on a create/update
 * DTO into the entity's `*Minor` columns — only touches fields that were
 * actually provided (`undefined` means "leave as-is", not "set to null"),
 * which matters for partial updates. Pure aside from `toMinorUnits` (itself
 * pure); no DB access, so directly unit-testable without mocking TypeORM.
 */
export function pricingToMinor(dto: PricingInput): Partial<Product> {
  const out: Partial<Product> = {};
  if (dto.price !== undefined) out.priceMinor = toMinorUnits(dto.price);
  if (dto.compareAtPrice !== undefined) out.compareAtMinor = toMinorUnits(dto.compareAtPrice);
  if (dto.cost !== undefined) out.costMinor = toMinorUnits(dto.cost);
  if (dto.wholesaleMin !== undefined) out.wholesaleMinMinor = toMinorUnits(dto.wholesaleMin);
  if (dto.wholesaleMax !== undefined) out.wholesaleMaxMinor = toMinorUnits(dto.wholesaleMax);
  return out;
}
