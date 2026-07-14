import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { ReturnEventsController } from './return-events.controller';

@Module({
  imports: [DispatchModule],
  controllers: [ReturnEventsController],
})
export class ReturnEventsModule {}
