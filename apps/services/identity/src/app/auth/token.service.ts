import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import {
  JwtAccessPayload,
  MfaChallengePayload,
  StoreSelectionPayload,
  SetupChallengePayload,
  InternalTokenPayload,
  Role,
  permissionsForRole,
} from '@temp-nx/auth';
import { KeyService } from './key.service';
import { ttlToSeconds } from './ttl-seconds.util';

/** OAuth2-shaped response for `POST /auth/token` (client_credentials grant). */
export interface ClientCredentialsTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly keys: KeyService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(params: {
    userId: string;
    storeId: string;
    role: Role;
  }): Promise<string> {
    const payload: Omit<JwtAccessPayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: params.userId,
      store_id: params.storeId,
      role: params.role,
      perms: permissionsForRole(params.role),
      type: 'access',
    };
    return this.keys.sign(payload, {
      ttl: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      jti: ulid(),
    });
  }

  async signMfaChallenge(userId: string): Promise<string> {
    const payload: Omit<MfaChallengePayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: userId,
      type: 'mfa_challenge',
    };
    return this.keys.sign(payload, { ttl: '5m', jti: ulid() });
  }

  async verifyMfaChallenge(token: string): Promise<MfaChallengePayload> {
    const payload = await this.keys.verify<MfaChallengePayload>(token);
    if (payload.type !== 'mfa_challenge') {
      throw new Error('Not an MFA challenge token');
    }
    return payload;
  }

  async signStoreSelection(userId: string): Promise<string> {
    const payload: Omit<StoreSelectionPayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: userId,
      type: 'store_selection',
    };
    return this.keys.sign(payload, { ttl: '5m', jti: ulid() });
  }

  async verifyStoreSelection(token: string): Promise<StoreSelectionPayload> {
    const payload = await this.keys.verify<StoreSelectionPayload>(token);
    if (payload.type !== 'store_selection') {
      throw new Error('Not a store-selection token');
    }
    return payload;
  }

  async signSetupChallenge(userId: string): Promise<string> {
    const payload: Omit<SetupChallengePayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: userId,
      type: 'setup_challenge',
    };
    return this.keys.sign(payload, { ttl: '30m', jti: ulid() });
  }

  async verifySetupChallenge(token: string): Promise<SetupChallengePayload> {
    const payload = await this.keys.verify<SetupChallengePayload>(token);
    if (payload.type !== 'setup_challenge') {
      throw new Error('Not a setup-challenge token');
    }
    return payload;
  }

  /**
   * Issues a client-credentials access token for a validated
   * `ServiceAccount` (see ServiceAccountsService for the
   * credential check + scope resolution; this only signs + shapes the
   * response). Replaces the old unused `signInternalToken(serviceName)`
   * stub, which had no client/scope/secret verification behind it at all.
   */
  async issueInternalToken(params: {
    clientId: string;
    serviceName: string;
    scopes: string[];
  }): Promise<ClientCredentialsTokenResponse> {
    const ttl = this.config.get<string>('JWT_INTERNAL_TTL', '5m');
    const payload: Omit<InternalTokenPayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: params.clientId,
      svc: params.serviceName,
      scope: params.scopes,
      aud: 'internal',
      type: 'internal',
    };
    const accessToken = await this.keys.sign(payload, { ttl, jti: ulid() });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttlToSeconds(ttl),
      scope: params.scopes.join(' '),
    };
  }
}
