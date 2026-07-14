import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { Order } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { SagaState } from '../entities/saga-state.entity';
import { CheckoutSagaModule } from '../checkout/saga/checkout-saga.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderLine, SagaState]), CheckoutSagaModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
