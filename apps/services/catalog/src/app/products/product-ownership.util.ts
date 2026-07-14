import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';

/**
 * Options and variants have no `store_id` of their own (see ProductOption's
 * doc comment) — every nested `/products/:productId/options|variants/**`
 * endpoint calls this first so a request can't read or mutate another
 * store's product's children just by guessing/reusing a `productId`.
 */
export async function assertProductOwned(
  repo: Repository<Product>,
  storeId: string,
  productId: string,
): Promise<Product> {
  const product = await repo.findOne({ where: { id: productId, storeId } });
  if (!product) {
    throw new NotFoundException(`Product ${productId} not found`);
  }
  return product;
}
