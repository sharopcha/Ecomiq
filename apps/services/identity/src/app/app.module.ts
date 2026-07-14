import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '@temp-nx/auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { identityDataSourceOptions } from '../data-source';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { StoresModule } from './stores/stores.module';
import { MembershipsModule } from './memberships/memberships.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(identityDataSourceOptions),
    ThrottlerModule.forRoot([
      // Generous service-level default; the gateway applies the
      // user-facing rate limit — this is a defense-in-depth backstop
      // (e.g. against direct access during local dev / service-to-service misuse).
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    RedisModule,
    UsersModule,
    StoresModule,
    MembershipsModule,
    InvitationsModule,
    MailModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
