/**
 * Generates the RS256 keypair identity-service uses to sign access tokens.
 * Run once per environment: `npm run identity:keys:generate` (from the repo
 * root — the path below is resolved relative to process.cwd(), the same way
 * KeyService resolves JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH at runtime).
 * Output goes to apps/services/identity/keys/{private,public}.pem — gitignored.
 */
import { generateKeyPairSync } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const keysDir = join(process.cwd(), 'apps/services/identity/keys');

if (existsSync(join(keysDir, 'private.pem'))) {
  console.log(
    `A keypair already exists at ${keysDir}. Delete private.pem/public.pem first if you really want to rotate it (note: this invalidates all outstanding access tokens and JWKS consumers' caches).`,
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
console.log(
  'Set JWT_KID in .env to a stable identifier for this key (default: identity-key-1).',
);
