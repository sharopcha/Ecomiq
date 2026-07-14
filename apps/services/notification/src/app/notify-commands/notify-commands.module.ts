import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { NotifyCommandsController } from './notify-commands.controller';

@Module({
  imports: [DispatchModule],
  controllers: [NotifyCommandsController],
})
export class NotifyCommandsModule {}
