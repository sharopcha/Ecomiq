import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';

/**
 * `customer_address` has no `store_id` of its own — every nested
 * `/customers/:customerId/addresses/**` endpoint calls this first so a
 * request can't read or mutate another store's customer's addresses just by
 * guessing/reusing a `customerId`. Mirrors catalog's `assertProductOwned`.
 */
export async function assertCustomerOwned(
  repo: Repository<Customer>,
  storeId: string,
  customerId: string,
): Promise<Customer> {
  const customer = await repo.findOne({ where: { id: customerId, storeId } });
  if (!customer) {
    throw new NotFoundException(`Customer ${customerId} not found`);
  }
  return customer;
}
