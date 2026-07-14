import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../entities/payment.entity';
import { RefundExecution } from '../entities/refund-execution.entity';
import { ProviderModule } from '../provider/provider.module';
import { RefundCommandsController } from './refund-commands.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, RefundExecution]), ProviderModule],
  controllers: [RefundCommandsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
