import {
  DynamicModule,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from '@temp-nx/typeorm';
import { OutboxRelayService } from './outbox-relay.service';
import { PulsarProducerService } from './pulsar-producer.service';
import { PULSAR_MODULE_OPTIONS, PulsarModuleOptions } from './pulsar.module-options';

export interface PulsarModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  /** Same shape as any Nest `useFactory` provider's `inject` — tokens, not providers. */
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => Promise<PulsarModuleOptions> | PulsarModuleOptions;
}

/**
 * Registers the outbox-publishing side of the Pulsar integration:
 * `PulsarProducerService` (for anything that wants to publish directly) and
 * `OutboxRelayService` (the poller that drains each service's own `outbox`
 * table). Import this once in a service's `AppModule`.
 *
 * Deliberately does **not** register `PulsarServer` — that's the
 * consumer-side transport strategy, constructed directly in `main.ts` and
 * passed to `app.connectMicroservice({ strategy })`, not a DI provider
 * (that's how NestJS custom transporters normally work; see pulsar.server.ts).
 *
 * Self-contained: also imports `TypeOrmModule.forFeature([OutboxMessage])`
 * so consumers don't have to remember to do that themselves alongside this
 * module. Domain code writing outbox rows inside its own transactions still
 * uses `recordOutboxEvent(manager, ...)` directly against the same
 * `EntityManager` — it doesn't go through this module's repository.
 */
@Module({})
export class PulsarModule {
  static forRootAsync(options: PulsarModuleAsyncOptions): DynamicModule {
    return {
      module: PulsarModule,
      imports: [...(options.imports ?? []), TypeOrmModule.forFeature([OutboxMessage])],
      providers: [
        {
          provide: PULSAR_MODULE_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        PulsarProducerService,
        OutboxRelayService,
      ],
      exports: [PulsarProducerService, PULSAR_MODULE_OPTIONS],
    };
  }
}
