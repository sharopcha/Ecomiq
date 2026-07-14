import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import { SupplierJwtPayload } from '@temp-nx/auth';
import { KeyService } from './key.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly keys: KeyService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(params: { supplierId: string; storeId: string }): Promise<string> {
    const payload: Omit<SupplierJwtPayload, 'iss' | 'iat' | 'exp' | 'jti'> = {
      sub: params.supplierId,
      store_id: params.storeId,
      aud: 'supplier',
      type: 'supplier_access',
    };
    return this.keys.sign(payload, {
      ttl: this.config.get<string>('PURCHASING_JWT_ACCESS_TTL', '15m'),
      jti: ulid(),
    });
  }
}
