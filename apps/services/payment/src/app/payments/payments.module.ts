import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSharedModule, GrpcInternalAuthGuard } from '@temp-nx/auth';
import { Payment } from '../entities/payment.entity';
import { ProviderModule } from '../provider/provider.module';
import { PaymentsService } from './payments.service';
import { IntentsController } from './intents.controller';
import { PaymentsController } from './payments.controller';
import { PaymentGrpcController } from './payment-grpc.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    ProviderModule,
    // GrpcInternalAuthGuard needs InternalTokenVerifierService — imported
    // here explicitly (same factory as app.module.ts) rather than relying
    // on cross-module guard resolution, so this module's own DI graph is
    // self-sufficient (mirrors inventory's reservations.module.ts).
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
  // PaymentGrpcController has no HTTP routes — dispatched by the gRPC
  // microservice wired in main.ts, same as ReservationGrpcController.
  controllers: [IntentsController, PaymentsController, PaymentGrpcController],
  providers: [PaymentsService, GrpcInternalAuthGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
