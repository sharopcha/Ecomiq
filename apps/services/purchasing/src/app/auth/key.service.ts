import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, exportJWK, JWTPayload } from 'jose';

// jose v6 dropped the `KeyLike` export in favor of the native CryptoKey type
// returned by importPKCS8/importSPKI — infer it instead of naming it.
type AsymmetricKey = Awaited<ReturnType<typeof importPKCS8>>;

/**
 * purchasing-service's own RS256 keypair for the *supplier* JWT principal —
 * a separate keypair from identity's staff one and crm's customer one,
 * never mixed with either (supplier tokens carry `aud: 'supplier'`; neither
 * of the other two principals' tokens ever do). Copied from crm-service's
 * `key.service.ts` with `PURCHASING_JWT_*` env vars in place of `CRM_JWT_*`.
 *
 * Same single-active-keypair limitation as identity's/crm's: no real
 * multi-key rotation today, just a stable `kid` served in the JWKS
 * response.
 */
@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = new Logger(KeyService.name);
  private privateKey!: AsymmetricKey;
  private publicKey!: AsymmetricKey;
  private kid!: string;
  private issuer!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const privatePath = join(
      process.cwd(),
      this.config.get<string>('PURCHASING_JWT_PRIVATE_KEY_PATH', 'apps/services/purchasing/keys/private.pem'),
    );
    const publicPath = join(
      process.cwd(),
      this.config.get<string>('PURCHASING_JWT_PUBLIC_KEY_PATH', 'apps/services/purchasing/keys/public.pem'),
    );

    let privatePem: string;
    let publicPem: string;
    try {
      privatePem = readFileSync(privatePath, 'utf8');
      publicPem = readFileSync(publicPath, 'utf8');
    } catch (err) {
      this.logger.error(
        `Could not read RS256 keypair at ${privatePath} / ${publicPath}. Run "npm run purchasing:keys:generate" first.`,
      );
      throw err;
    }

    this.privateKey = await importPKCS8(privatePem, 'RS256');
    this.publicKey = await importSPKI(publicPem, 'RS256');
    this.kid = this.config.get<string>('PURCHASING_JWT_KID', 'purchasing-supplier-key-1');
    this.issuer = this.config.get<string>('PURCHASING_JWT_ISSUER', 'ecomiq-purchasing-supplier');
  }

  get issuerName() {
    return this.issuer;
  }

  async sign(payload: JWTPayload, opts: { ttl: string; jti: string }): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setExpirationTime(opts.ttl)
      .setJti(opts.jti)
      .sign(this.privateKey);
  }

  async verify<T extends JWTPayload>(token: string): Promise<T> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: this.issuer,
      algorithms: ['RS256'],
    });
    return payload as T;
  }

  /** Served at GET /api/purchasing/auth/jwks (via the gateway's purchasing-auth public sub-route). */
  async getJwks() {
    const jwk = await exportJWK(this.publicKey);
    return {
      keys: [
        {
          ...jwk,
          kid: this.kid,
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }
}
