import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  createS3Client,
  MEDIA_S3_INTERNAL_CLIENT,
  MEDIA_S3_PUBLIC_CLIENT,
  resolveS3Endpoint,
} from './s3-clients';
import { StorageService } from './storage.service';

/**
 * Registers the two `S3Client` instances (see s3-clients.ts for why there
 * are two, not one) and `StorageService`. Import this once in AppModule;
 * every other module that needs storage depends on `StorageService`, never
 * on `S3Client`/the injection tokens directly.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MEDIA_S3_INTERNAL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createS3Client({
          endpoint: resolveS3Endpoint('internal', {
            MEDIA_S3_ENDPOINT: config.get<string>('MEDIA_S3_ENDPOINT'),
            MEDIA_S3_PUBLIC_ENDPOINT: config.get<string>('MEDIA_S3_PUBLIC_ENDPOINT'),
          }),
          region: config.get<string>('MEDIA_S3_REGION', 'us-east-1'),
          accessKeyId: config.get<string>('MEDIA_S3_ACCESS_KEY', 'ecomiq'),
          secretAccessKey: config.get<string>('MEDIA_S3_SECRET_KEY', 'ecomiq123'),
        }),
    },
    {
      provide: MEDIA_S3_PUBLIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createS3Client({
          endpoint: resolveS3Endpoint('public', {
            MEDIA_S3_ENDPOINT: config.get<string>('MEDIA_S3_ENDPOINT'),
            MEDIA_S3_PUBLIC_ENDPOINT: config.get<string>('MEDIA_S3_PUBLIC_ENDPOINT'),
          }),
          region: config.get<string>('MEDIA_S3_REGION', 'us-east-1'),
          accessKeyId: config.get<string>('MEDIA_S3_ACCESS_KEY', 'ecomiq'),
          secretAccessKey: config.get<string>('MEDIA_S3_SECRET_KEY', 'ecomiq123'),
        }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
