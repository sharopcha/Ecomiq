import { Controller, Get } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { KeyService } from './key.service';

/**
 * Consumed by `SupplierJwtGuard` (and any other verifier of supplier
 * tokens) via `jwks-rsa` — purchasing's own JWKS, entirely separate from
 * identity's or crm's. Internal path `auth/jwks`; through the gateway's
 * purchasing-proxy this is reachable at `/api/purchasing/auth/jwks`.
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
