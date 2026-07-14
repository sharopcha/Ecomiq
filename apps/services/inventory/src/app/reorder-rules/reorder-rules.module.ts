import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReorderRule } from '../entities/reorder-rule.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { Location } from '../entities/location.entity';
import { ReorderRulesController } from './reorder-rules.controller';
import { ReorderRulesService } from './reorder-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReorderRule, CatalogVariantSnapshot, Location])],
  controllers: [ReorderRulesController],
  providers: [ReorderRulesService],
  exports: [ReorderRulesService],
})
export class ReorderRulesModule {}
