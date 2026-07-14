import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSharedModule, GrpcInternalAuthGuard } from '@temp-nx/auth';
import { Reservation } from '../entities/reservation.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { StockLevelsModule } from '../stock-levels/stock-levels.module';
import { ReservationsController } from './reservations.controller';
import { ReservationExpiryController } from './reservation-expiry.controller';
import { ReservationGrpcController } from './reservation-grpc.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation, StockLevel]),
    // For StockMovementsService — create()/release()/expire() all call
    // record() to apply the reservation/release movement.
    StockMovementsModule,
    // For ReservationGrpcController's variant/location -> stock_level
    // resolution.
    StockLevelsModule,
    // GrpcInternalAuthGuard needs InternalTokenVerifierService — imported
    // here explicitly (same factory as app.module.ts) rather than relying
    // on cross-module guard resolution, so this module's own DI graph is
    // self-sufficient.
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
  // ReservationExpiryController has no HTTP routes (see its doc comment) —
  // it's dispatched by the second PulsarServer wired in main.ts, same as
  // CatalogSyncController. ReservationGrpcController likewise has no HTTP
  // routes — dispatched by the gRPC microservice wired in main.ts.
  controllers: [ReservationsController, ReservationExpiryController, ReservationGrpcController],
  providers: [ReservationsService, GrpcInternalAuthGuard],
  exports: [ReservationsService],
})
export class ReservationsModule {}
