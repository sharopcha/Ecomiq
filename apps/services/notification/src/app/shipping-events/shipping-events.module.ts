import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { ShippingEventsController } from './shipping-events.controller';

@Module({
  imports: [DispatchModule],
  controllers: [ShippingEventsController],
})
export class ShippingEventsModule {}
