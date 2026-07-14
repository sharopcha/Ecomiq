import { Controller, Get } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { KeyService } from './key.service';

/**
 * Consumed by the future `CustomerJwtGuard` (and any other verifier of
 * customer tokens) via `jwks-rsa` — crm's own JWKS, entirely separate from
 * identity's. Internal path `auth/jwks`; through the gateway's crm-proxy
 * this is reachable at `/api/crm/auth/jwks`.
 */
@Controller('auth')
export class JwksController {
  constructor(private readonly keys: KeyService) {}

  @Public()
  @Get('jwks')
  getJwks() {
    return this.keys.getJwks();
  }
}
