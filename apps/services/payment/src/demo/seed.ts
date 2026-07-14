/**
 * payment-service deliberately has no seed data: unlike
 * catalog/inventory/marketing/order, there's no useful "known good
 * starting state" to pre-populate (a `Payment` row only makes sense
 * attached to a real order/checkout, and the mock provider needs no setup
 * of its own). This script stays a no-op so `npm run payment:seed` works
 * uniformly across every service in scripted verification.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('[seed] payment-service: nothing to seed (no useful standalone seed data — see this file\'s doc comment).');
  await app.close();
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
