import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(process.cwd(), '..', '..');
const apiDir = path.resolve(repoRoot, 'apps', 'api');
const stateDir = path.resolve(apiDir, '.wrangler', 'state');
const dbName = 'product-watcher-db';
const wranglerEntry = require.resolve('wrangler/bin/wrangler.js');

const run = (args) => execFileSync(process.execPath, [wranglerEntry, ...args], { cwd: apiDir, stdio: 'inherit' });

if (!fs.existsSync(stateDir)) {
  fs.mkdirSync(stateDir, { recursive: true });
}

run(['d1', 'migrations', 'apply', dbName, '--local', '--persist-to', '.wrangler/state']);
run(['d1', 'execute', dbName, '--local', '--persist-to', '.wrangler/state', '--file', './src/db/seed.sql']);

console.log('Local D1 verification flow completed.');
