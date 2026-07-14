import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SendLog } from '../entities/send-log.entity';
import { TemplatesModule } from '../templates/templates.module';
import { ChannelsModule } from '../channels/channels.module';
import { DispatchService } from './dispatch.service';
import { MessageRetryController } from './message-retry.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SendLog]), ConfigModule, TemplatesModule, ChannelsModule],
  controllers: [MessageRetryController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
