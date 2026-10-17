import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Make the signing key pair, once. The private key goes to
 * license-signing/private.pem (never committed, never shipped: back it up
 * somewhere safe, it is what makes keys). The public key is written into
 * electron/license-public-key.mjs, which the app ships with.
 *
 *   node scripts/license/keygen.mjs [--force]
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const privatePath = path.join(root, 'license-signing', 'private.pem');

if (existsSync(privatePath) && !process.argv.includes('--force')) {
    console.error(`A signing key already exists at ${privatePath}. Making a new one stops every key you sold from working; pass --force if you really mean it.`);
    process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
mkdirSync(path.dirname(privatePath), { recursive: true });
writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

const pem = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(
    path.join(root, 'electron', 'license-public-key.mjs'),
    `/**\n * The public half of the licence signing key (made by scripts/license/keygen.mjs).\n * It can only check keys, never make them.\n */\nexport const PUBLIC_KEY = \`${pem.trim()}\`;\n`,
);

console.log(`Private key: ${privatePath} (back it up, keep it secret)`);
console.log('Public key written to electron/license-public-key.mjs');
