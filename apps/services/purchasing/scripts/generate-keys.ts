/**
 * Generates the RS256 keypair purchasing-service uses to sign/verify
 * *supplier* access tokens — purchasing's own keypair, entirely separate
 * from identity's staff one and crm's customer one. Run once per
 * environment: `npm run purchasing:keys:generate` (from the repo root —
 * resolved relative to process.cwd(), the same way KeyService resolves
 * PURCHASING_JWT_PRIVATE_KEY_PATH/PURCHASING_JWT_PUBLIC_KEY_PATH at
 * runtime). Output goes to apps/services/purchasing/keys/{private,public}.pem
 * — gitignored (the .gitignore glob covering every service's keys
 * directory already covers this path). Copied from crm-service's
 * `generate-keys.ts`.
 */
import { generateKeyPairSync } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const keysDir = join(process.cwd(), 'apps/services/purchasing/keys');

if (existsSync(join(keysDir, 'private.pem'))) {
  console.log(
    `A keypair already exists at ${keysDir}. Delete private.pem/public.pem first if you really want to rotate it (note: this invalidates all outstanding supplier access tokens and JWKS consumers' caches).`,
  );
  process.exit(0);
}

mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(join(keysDir, 'private.pem'), privateKey, { mode: 0o600 });
writeFileSync(join(keysDir, 'public.pem'), publicKey, { mode: 0o644 });

console.log(`RS256 keypair written to ${keysDir}`);
console.log('Set PURCHASING_JWT_KID in .env to a stable identifier for this key (default: purchasing-supplier-key-1).');
