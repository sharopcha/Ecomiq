/**
 * Runnable proof — boots the real Nest application context (real
 * `CustomersService`/`CustomerAddressesService`, real Postgres via
 * `crm_db`) and exercises customer CRUD plus nested address CRUD, same
 * "boot the real app context, drive the real services" pattern as
 * shipping's `labels-demo.ts`.
 *
 * Run:
 *   npm run crm:customers-demo
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../app/app.module';
import { CustomersService } from '../app/customers/customers.service';
import { CustomerAddressesService } from '../app/customer-addresses/customer-addresses.service';
import { CustomerStatus } from '../app/entities/customer.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storeId = `demo-store-${ulid()}`;
  const customers = app.get(CustomersService);
  const addresses = app.get(CustomerAddressesService);

  console.log('[customers-demo] customer CRUD...');
  const customer = await customers.create(storeId, {
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+15550100',
  });
  assert(customer.displayId === 'CST-1', `expected first customer to be CST-1, got ${customer.displayId}`);
  assert(customer.status === CustomerStatus.Active, 'new customer should default to active status');

  const second = await customers.create(storeId, { fullName: 'Grace Hopper' });
  assert(second.displayId === 'CST-2', `expected sequence to increment, got ${second.displayId}`);
  console.log('[customers-demo] OK — CST-<n> sequence increments per store.');

  const list = await customers.findAll(storeId, { limit: 10 } as never);
  assert(list.items.length === 2, `expected 2 customers, got ${list.items.length}`);

  const searched = await customers.findAll(storeId, { limit: 10, search: 'ada' } as never);
  assert(
    searched.items.length === 1 && searched.items[0].id === customer.id,
    'ILIKE search on full_name/email should find Ada by a lowercase substring',
  );
  console.log('[customers-demo] OK — list + search filter.');

  const updated = await customers.update(storeId, customer.id, { phone: '+15550199' });
  assert(updated.phone === '+15550199', 'update should persist the new phone');

  const archived = await customers.archive(storeId, second.id);
  assert(archived.status === CustomerStatus.Archived, 'archive should set status to archived');

  const activeOnly = await customers.findAll(storeId, { limit: 10, status: CustomerStatus.Active } as never);
  assert(
    activeOnly.items.length === 1 && activeOnly.items[0].id === customer.id,
    'status filter should exclude the archived customer',
  );
  console.log('[customers-demo] OK — update, archive, and status filter confirmed.');

  console.log('[customers-demo] nested address CRUD...');
  const address = await addresses.create(storeId, customer.id, {
    line1: '10 Downing St',
    city: 'London',
    countryCode: 'GB',
    isDefaultShipping: true,
  });
  const addressList = await addresses.findAll(storeId, customer.id);
  assert(
    addressList.length === 1 && addressList[0].id === address.id,
    'created address should belong to the customer — provable by findAll(storeId, customer.id) returning it',
  );

  const updatedAddress = await addresses.update(storeId, customer.id, address.id, { city: 'Westminster' });
  assert(updatedAddress.city === 'Westminster', 'address update should persist the new city');

  let crossStoreRejected = false;
  try {
    await addresses.findOne(`other-store-${ulid()}`, customer.id, address.id);
  } catch {
    crossStoreRejected = true;
  }
  assert(crossStoreRejected, 'address lookup under the wrong storeId must 404 (assertCustomerOwned)');

  await addresses.remove(storeId, customer.id, address.id);
  const afterRemove = await addresses.findAll(storeId, customer.id);
  assert(afterRemove.length === 0, 'address should be gone after remove');
  console.log('[customers-demo] OK — nested address CRUD + cross-store ownership check confirmed.');

  console.log('[customers-demo] ALL CHECKS PASSED');
  await app.close();
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[customers-demo] ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error('[customers-demo] FAILED:', err);
  process.exit(1);
});
