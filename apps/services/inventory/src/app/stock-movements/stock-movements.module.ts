import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement } from '../entities/stock-movement.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockMovement, StockLevel])],
  controllers: [StockMovementsController],
  providers: [StockMovementsService],
  // Exported so audit stock, reservations, and reorder receipts can inject
  // StockMovementsService and call record() rather than mutating
  // StockLevel themselves.
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
