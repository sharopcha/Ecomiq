import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { OrderEventsController } from './order-events.controller';

@Module({
  imports: [CustomersModule, LoyaltyModule, ReferralsModule],
  controllers: [OrderEventsController],
})
export class OrderEventsModule {}
