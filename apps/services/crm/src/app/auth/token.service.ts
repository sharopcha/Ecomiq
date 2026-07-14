import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import { CustomerJwtPayload } from '@temp-nx/auth';
import { KeyService } from './key.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly keys: KeyService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(params: { customerId: string; storeId: string }): Promise<string> {
    const payload: Omit<CustomerJwtPayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: params.customerId,
      store_id: params.storeId,
      aud: 'customer',
      type: 'customer_access',
    };
    return this.keys.sign(payload, {
      ttl: this.config.get<string>('CRM_JWT_ACCESS_TTL', '15m'),
      jti: ulid(),
    });
  }
}
