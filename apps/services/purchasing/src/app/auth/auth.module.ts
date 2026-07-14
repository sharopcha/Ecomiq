import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeyService } from './key.service';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwksController } from './jwks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), RedisModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService, KeyService, TokenService, RefreshTokenService],
})
export class AuthModule {}
