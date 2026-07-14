import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSharedModule, InternalAuthGuard } from '@temp-nx/auth';
import { Campaign } from '../entities/campaign.entity';
import { CampaignSend } from '../entities/campaign-send.entity';
import { SegmentSnapshot } from '../entities/segment-snapshot.entity';
import { CampaignsController } from './campaigns.controller';
import { CampaignFireController } from './campaign-fire.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    // SegmentSnapshot is read-only from here (segment-sync's own module
    // owns the writes) — registered here too so CampaignsService can
    // inject its repository for send-time recipient resolution.
    TypeOrmModule.forFeature([Campaign, CampaignSend, SegmentSnapshot]),
    // InternalAuthGuard (recordSendEvent — notification-service's webhook
    // forwarder) needs InternalTokenVerifierService — imported here
    // explicitly (same factory as app.module.ts) rather than relying on
    // cross-module guard resolution, so this module's own DI graph is
    // self-sufficient (mirrors marketing's own discounts.module.ts).
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
  // CampaignFireController has no HTTP routes — dispatched by the
  // campaign-events::marketing-service PulsarServer connection (main.ts),
  // same pattern as order-service's PaymentEventsController.
  controllers: [CampaignsController, CampaignFireController],
  providers: [CampaignsService, InternalAuthGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
