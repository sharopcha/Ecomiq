import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  JWTPayload,
} from 'jose';

// jose v6 dropped the `KeyLike` export in favor of the native CryptoKey type
// returned by importPKCS8/importSPKI — infer it instead of naming it.
type AsymmetricKey = Awaited<ReturnType<typeof importPKCS8>>;

/**
 * Loads the RS256 keypair (generated via `npm run identity:keys:generate`)
 * and provides sign/verify + JWKS export. Access tokens carry a `kid` header
 * so identity-service can rotate keys later by publishing both old+new in
 * the JWKS response while only signing with the new one.
 */
@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = new Logger(KeyService.name);
  private privateKey!: AsymmetricKey;
  private publicKey!: AsymmetricKey;
  private publicKeyPem!: string;
  private kid!: string;
  private issuer!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const privatePath = join(
      process.cwd(),
      this.config.get<string>(
        'JWT_PRIVATE_KEY_PATH',
        'apps/services/identity/keys/private.pem',
      ),
    );
    const publicPath = join(
      process.cwd(),
      this.config.get<string>(
        'JWT_PUBLIC_KEY_PATH',
        'apps/services/identity/keys/public.pem',
      ),
    );

    let privatePem: string;
    let publicPem: string;
    try {
      privatePem = readFileSync(privatePath, 'utf8');
      publicPem = readFileSync(publicPath, 'utf8');
    } catch (err) {
      this.logger.error(
        `Could not read RS256 keypair at ${privatePath} / ${publicPath}. Run "npm run identity:keys:generate" first.`,
      );
      throw err;
    }

    this.privateKey = await importPKCS8(privatePem, 'RS256');
    this.publicKey = await importSPKI(publicPem, 'RS256');
    this.publicKeyPem = publicPem;
    this.kid = this.config.get<string>('JWT_KID', 'identity-key-1');
    this.issuer = this.config.get<string>('JWT_ISSUER', 'ecomiq-identity');
  }

  get issuerName() {
    return this.issuer;
  }

  async sign(
    payload: JWTPayload,
    opts: { ttl: string; jti: string },
  ): Promise<string> {
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

  /** Served at GET /.well-known/jwks.json — see JwksController. */
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
