import 'reflect-metadata';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PulsarServer, topicForCommands } from '@temp-nx/pulsar';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // NestJS's built-in raw-body capture (`req.rawBody`), not a
  // hand-rolled `express.raw()` scoped to one path (repo rule: this must
  // NOT be service-wide the way the gateway's proxy does it — every other
  // route here still needs normal JSON parsing via the ValidationPipe
  // below). `rawBody: true` makes Nest additionally buffer the raw bytes
  // alongside its normal body-parser middleware for *every* route; only
  // `webhooks.controller.ts`'s handler actually reads `req.rawBody`.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway). See
  // the matching comment in identity-service's main.ts for the full
  // rationale (per-client ThrottlerGuard bucketing, IP spoofing risk of `true`).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // gRPC microservice connection alongside the HTTP listener above
  // (same hybrid-app pattern as inventory's main.ts): order-service's
  // checkout saga calls CreatePaymentIntent/CancelPaymentIntent
  // synchronously (ADR-7), so it needs a request/response transport, not an
  // event stream. PaymentGrpcController (payments.module.ts) is what
  // actually handles calls.
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'ecomiq.payment.v1',
      protoPath: join(process.cwd(), 'libs/contracts/proto/payment/v1/payment_intent.proto'),
      url: `0.0.0.0:${process.env.PAYMENT_GRPC_PORT || 50053}`,
      // loader.defaults: true — NestJS's gRPC server dispatches via
      // @grpc/proto-loader's own runtime .proto parsing, NOT the ts-proto
      // generated encode/decode payment-grpc-client.ts uses — the two are
      // fully independent. proto-loader's own default (`defaults: false`)
      // does NOT fill in proto3 scalar defaults for fields absent from the
      // wire (which for a zero-valued scalar like `amount_minor: 0` is
      // *every* zero value, per proto3's own encoding rule) — the field is
      // simply missing from the decoded object (`undefined`), not `0`.
      // ts-proto's client-side decode always initializes a base object with
      // every field's default first, so this divergence was invisible until
      // a real 0 was sent: reproduced live via payment:grpc-demo — sending
      // `amountMinor: 0` reached PaymentGrpcController as `undefined`,
      // silently passed the `<= 0` INVALID_AMOUNT guard, and hit a Postgres
      // NOT NULL violation instead of the intended typed failure.
      // `longs: Number` is the companion fix: proto-loader's default `longs`
      // representation for int64 fields (amount_minor here) is a `Long`
      // object, not a plain number — `Number` matches ts-proto's own
      // `amountMinor: number` type. Inventory's reservation.proto never hit
      // either gap: its numeric field (`qty`) is `int32`, decoded as a plain
      // number by proto-loader regardless of these options, and none of its
      // fields are zero-valued in the demo's actual calls.
      loader: { longs: Number, defaults: true },
    },
  });

  // A *second* microservice connection, this one Pulsar again but
  // subscribed to the payment.commands topic rather than an
  // <aggregate>.events stream (order-service's refund approval
  // publishes payments.refund.execute here). PulsarServer was built for
  // aggregate/event topics; `topics` (an explicit override) is what lets
  // it subscribe to a `.commands`-suffixed topic instead — see
  // PulsarServerOptions.topics's doc comment. RefundCommandsController
  // (refunds.module.ts) is what actually handles the command. Shared
  // subscription type: commands don't need per-key ordering (unlike the
  // KeyShared event-stream subscriptions elsewhere in this repo).
  app.connectMicroservice({
    strategy: new PulsarServer({
      serviceUrl: process.env.PULSAR_SERVICE_URL || 'pulsar://localhost:6650',
      tenant: process.env.PULSAR_TENANT || 'ecomiq',
      namespace: process.env.PAYMENT_PULSAR_NAMESPACE || 'payments',
      aggregates: [],
      topics: [
        topicForCommands(
          process.env.PULSAR_TENANT || 'ecomiq',
          process.env.PAYMENT_PULSAR_NAMESPACE || 'payments',
          'payment',
        ),
      ],
      subscription: 'payment-commands::payment-service',
      subscriptionType: 'Shared',
      authToken: process.env.PULSAR_AUTH_TOKEN,
    }),
  });

  await app.startAllMicroservices();

  const port = process.env.PAYMENT_PORT || process.env.PORT || 3005;
  await app.listen(port);
  Logger.log(`🚀 payment-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
