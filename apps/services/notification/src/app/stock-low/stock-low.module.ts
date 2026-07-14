import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { StockLowController } from './stock-low.controller';

@Module({
  imports: [DispatchModule],
  controllers: [StockLowController],
})
export class StockLowModule {}
