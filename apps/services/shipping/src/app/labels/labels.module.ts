import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingLabel } from '../entities/shipping-label.entity';
import { ShippingLabelPackage } from '../entities/shipping-label-package.entity';
import { PackagePreset } from '../entities/package-preset.entity';
import { CarrierModule } from '../carrier/carrier.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingLabel, ShippingLabelPackage, PackagePreset]), CarrierModule],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
