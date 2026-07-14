import { Module } from '@nestjs/common';
import { ExternalSourcePort } from './external-source.port';
import { MockUnsplashAdapter } from './mock-unsplash.adapter';
import { MockCloudPickerAdapter } from './mock-cloud-picker.adapter';
import { ExternalSourcesController } from './external-sources.controller';
import { EXTERNAL_SOURCE_REGISTRY, ExternalSourceRegistry } from './external-source-registry.token';

/**
 * Registers one adapter instance per `source` that actually has one —
 * `content_library`/`ai_generated` are deliberately absent (the plan's
 * "accepted as import sources without an adapter" — the caller supplies a
 * URL directly, handled in `FilesService.importFile`, not looked up here).
 * Swapping a mock for a real adapter later is a one-line change to this
 * map, same "swap the registration, not the callers" shape as
 * `CarrierModule`/`provider.module.ts`.
 */
@Module({
  controllers: [ExternalSourcesController],
  providers: [
    {
      provide: EXTERNAL_SOURCE_REGISTRY,
      useFactory: (): ExternalSourceRegistry =>
        new Map<string, ExternalSourcePort>([
          ['unsplash', new MockUnsplashAdapter()],
          ['dropbox', new MockCloudPickerAdapter('dropbox')],
          ['google_drive', new MockCloudPickerAdapter('google_drive')],
          ['one_drive', new MockCloudPickerAdapter('one_drive')],
        ]),
    },
  ],
  exports: [EXTERNAL_SOURCE_REGISTRY],
})
export class ExternalSourcesModule {}
