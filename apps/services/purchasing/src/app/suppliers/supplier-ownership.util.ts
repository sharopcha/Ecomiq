import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';

/**
 * `supplier_review` has no `store_id` check of its own beyond the FK —
 * every nested `/suppliers/:supplierId/reviews/**` endpoint calls this first
 * so a request can't read or mutate another store's supplier's reviews just
 * by guessing/reusing a `supplierId`. Mirrors crm's `assertCustomerOwned`.
 */
export async function assertSupplierOwned(
  repo: Repository<Supplier>,
  storeId: string,
  supplierId: string,
): Promise<Supplier> {
  const supplier = await repo.findOne({ where: { id: supplierId, storeId } });
  if (!supplier) {
    throw new NotFoundException(`Supplier ${supplierId} not found`);
  }
  return supplier;
}
