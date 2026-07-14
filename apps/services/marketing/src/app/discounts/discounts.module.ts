import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSharedModule, GrpcInternalAuthGuard } from '@temp-nx/auth';
import { Discount } from '../entities/discount.entity';
import { DiscountUsage } from '../entities/discount-usage.entity';
import { DiscountsController } from './discounts.controller';
import { DiscountGrpcController } from './discount-grpc.controller';
import { DiscountsService } from './discounts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Discount, DiscountUsage]),
    // GrpcInternalAuthGuard needs InternalTokenVerifierService — imported
    // here explicitly (same factory as app.module.ts) rather than relying
    // on cross-module guard resolution, so this module's own DI graph is
    // self-sufficient (mirrors payment's payments.module.ts).
    AuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'JWKS_URI',
          'http://localhost:3001/api/.well-known/jwks.json',
        ),
        issuer: config.get<string>('JWT_ISSUER', 'ecomiq-identity'),
      }),
    }),
  ],
  // DiscountGrpcController has no HTTP routes — dispatched by the gRPC
  // microservice wired in main.ts, same as
  // ReservationGrpcController/PaymentGrpcController.
  controllers: [DiscountsController, DiscountGrpcController],
  providers: [DiscountsService, GrpcInternalAuthGuard],
  exports: [DiscountsService],
})
export class DiscountsModule {}
