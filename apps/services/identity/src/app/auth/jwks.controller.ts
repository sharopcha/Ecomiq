import { Controller, Get } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { KeyService } from './key.service';

@Controller()
export class JwksController {
  constructor(private readonly keys: KeyService) {}

  /**
   * Consumed by the gateway (and, eventually, every other service) via
   * `jwks-rsa` to verify RS256 access tokens without ever seeing the
   * private key — see ADR-5 / Service Communication#AuthN/Z.
   */
  @Public()
  @Get('.well-known/jwks.json')
  getJwks() {
    return this.keys.getJwks();
  }
}
