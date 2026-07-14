import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from '../entities/store.entity';
import { StoresService } from './stores.service';
import { MarketsController } from './markets.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [MarketsController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
