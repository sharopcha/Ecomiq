// Generated code lives under src/generated/ (checked in — see the
// `contracts:gen` npm script and README.md in this lib for how it's
// produced/regenerated; sandbox `npm install`/postinstall is unreliable,
// so this is not a build-time step). Re-exported here so consumers import
// `@temp-nx/contracts` rather than reaching into src/generated/* directly.
export * from './generated/inventory/v1/reservation';
// Authenticated gRPC client factory for ReservationService — see
// its own doc comment for why this is a plain grpc-js client rather than
// NestJS's ClientGrpc.
export * from './inventory-grpc-client';
// Same generated-contract + client-factory pattern for PaymentIntentService.
export * from './generated/payment/v1/payment_intent';
export * from './payment-grpc-client';
// Same pattern for DiscountService.
export * from './generated/marketing/v1/discount';
export * from './marketing-grpc-client';
