import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAccount } from '../entities/service-account.entity';
import { ServiceAccountsService } from './service-accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceAccount])],
  providers: [ServiceAccountsService],
  exports: [ServiceAccountsService],
})
export class ServiceAccountsModule {}
