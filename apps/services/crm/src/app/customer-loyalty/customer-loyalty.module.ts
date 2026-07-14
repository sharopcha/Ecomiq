import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CustomerLoyaltyController } from './customer-loyalty.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer]), LoyaltyModule],
  controllers: [CustomerLoyaltyController],
})
export class CustomerLoyaltyModule {}
