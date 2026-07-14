import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockAudit } from '../entities/stock-audit.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { StockAuditsController } from './stock-audits.controller';
import { StockAuditsService } from './stock-audits.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockAudit, StockLevel]),
    // For StockMovementsService — StockAuditsService.create() calls its
    // record() to apply a quantity adjustment's discrepancy.
    StockMovementsModule,
  ],
  controllers: [StockAuditsController],
  providers: [StockAuditsService],
  exports: [StockAuditsService],
})
export class StockAuditsModule {}
