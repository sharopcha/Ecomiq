import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../entities/payment.entity';
import { WebhookInbox } from '../entities/webhook-inbox.entity';
import { ProviderModule } from '../provider/provider.module';
import { RefundsModule } from '../refunds/refunds.module';
import { WebhooksController } from './webhooks.controller';
import { WebhookDispatchService } from './webhook-dispatch.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, WebhookInbox]), ProviderModule, RefundsModule],
  controllers: [WebhooksController],
  providers: [WebhookDispatchService],
})
export class WebhooksModule {}
