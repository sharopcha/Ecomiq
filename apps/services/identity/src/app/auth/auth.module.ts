import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthSharedModule } from '@temp-nx/auth';
import { UsersModule } from '../users/users.module';
import { StoresModule } from '../stores/stores.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { MailModule } from '../mail/mail.module';
import { ServiceAccountsModule } from '../service-accounts/service-accounts.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeyService } from './key.service';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { TotpService } from './totp.service';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwksController } from './jwks.controller';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    StoresModule,
    MembershipsModule,
    InvitationsModule,
    MailModule,
    ServiceAccountsModule,
    // identity-service verifies its own access tokens (GET /auth/me, /auth/2fa/*,
    // POST /auth/invitations) the same way every other service will: against its
    // own published JWKS. Keeps a single verification code path (JwtAuthGuard)
    // instead of a bespoke one just for this service.
    AuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'JWKS_URI',
          `http://localhost:${config.get('IDENTITY_PORT', 3001)}/api/.well-known/jwks.json`,
        ),
        issuer: config.get<string>('JWT_ISSUER', 'ecomiq-identity'),
      }),
    }),
  ],
  controllers: [AuthController, JwksController],
  providers: [
    AuthService,
    KeyService,
    TokenService,
    RefreshTokenService,
    TotpService,
    LocalStrategy,
    GoogleStrategy,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
