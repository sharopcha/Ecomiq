import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalTokenClient, InternalTokenClientModule } from '@temp-nx/auth';
import { Order } from '../../entities/order.entity';
import { OrderLine } from '../../entities/order-line.entity';
import { SagaState } from '../../entities/saga-state.entity';
import { OrdersModule } from '../../orders/orders.module';
import { CheckoutController } from '../checkout.controller';
import { PaymentEventsController } from '../payment-events/payment-events.controller';
import { CHECKOUT_SAGA_PORTS } from './checkout-saga-ports';
import { createGrpcCheckoutPorts } from './grpc-checkout-ports';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';
import { PaymentTimeoutController } from './payment-timeout.controller';
import { ReservationExpiredController } from './reservation-expired.controller';

// order-service's checkout saga is the *other* caller of every scope
// inventory:reserve/inventory:release/payments:create_intent/
// payments:cancel_intent/marketing:validate_discount — the same set the
// `order-service` service account was seeded with in its demo prep.
// Requesting exactly this set (not omitting `scope` to get "everything
// allowed") keeps the token's blast radius visible in one place.
const CHECKOUT_SAGA_SCOPE =
  'inventory:reserve inventory:release payments:create_intent payments:cancel_intent marketing:validate_discount';

@Module({
  imports: [
    TypeOrmModule.forFeature([SagaState, Order, OrderLine]),
    OrdersModule,
    InternalTokenClientModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        tokenUrl: config.get<string>('IDENTITY_TOKEN_URL', 'http://localhost:3001/api/auth/token'),
        clientId: config.get<string>('ORDER_SERVICE_CLIENT_ID', 'order-service'),
        clientSecret: config.get<string>('ORDER_SERVICE_CLIENT_SECRET', ''),
        scope: CHECKOUT_SAGA_SCOPE,
      }),
    }),
  ],
  // PaymentEventsController/PaymentTimeoutController have no HTTP routes —
  // dispatched by main.ts's Pulsar microservice connections, same as
  // ReturnExpiryController/RefundCommandsController.
  controllers: [CheckoutController, PaymentEventsController, PaymentTimeoutController, ReservationExpiredController],
  providers: [
    {
      provide: CHECKOUT_SAGA_PORTS,
      inject: [ConfigService, InternalTokenClient],
      useFactory: (config: ConfigService, tokenClient: InternalTokenClient) =>
        createGrpcCheckoutPorts({
          inventoryUrl: config.get<string>('INVENTORY_GRPC_URL', 'localhost:50051'),
          paymentUrl: config.get<string>('PAYMENT_GRPC_URL', 'localhost:50053'),
          marketingUrl: config.get<string>('MARKETING_GRPC_URL', 'localhost:50052'),
          getToken: () => tokenClient.getToken(),
        }),
    },
    CheckoutSagaOrchestrator,
  ],
  exports: [CheckoutSagaOrchestrator],
})
export class CheckoutSagaModule {}
