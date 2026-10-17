import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { issueKey } from '../../electron/license-core.mjs';

/**
 * Make a licence key for a customer, signed with license-signing/private.pem.
 *
 *   node scripts/license/issue.mjs --name "Jane Doe" --email jane@example.com [--plan clan] [--servers 5] [--days 365]
 *
 * Without --days the licence never ends; without --servers it runs any number of servers.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const brand = JSON.parse(readFileSync(path.join(root, 'brand.json'), 'utf8'));
const { values } = parseArgs({
    options: {
        name: { type: 'string' },
        email: { type: 'string' },
        plan: { type: 'string', default: 'standard' },
        servers: { type: 'string' },
        days: { type: 'string' },
    },
});

if (!values.name || !values.email) {
    console.error('Usage: node scripts/license/issue.mjs --name "Jane Doe" --email jane@example.com [--plan clan] [--servers 5] [--days 365]');
    process.exit(1);
}

const privatePem = readFileSync(path.join(root, 'license-signing', 'private.pem'), 'utf8');
const key = issueKey({ name: values.name, email: values.email, plan: values.plan, servers: values.servers ? Number(values.servers) : null, days: values.days ? Number(values.days) : null }, privatePem, brand.licenseKeyPrefix);

console.log(key);
