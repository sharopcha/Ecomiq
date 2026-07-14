import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthProxyController } from './auth-proxy.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AuthProxyController],
})
export class AuthProxyModule {}
