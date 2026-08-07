#!/usr/bin/env node
// Idempotent npm publish for the single-package sifa-page-renderer release.
//
// Adapted from sifa-sdk's script of the same name. Two reasons it exists
// rather than plain `changeset publish`:
//
//   1. Idempotency. A re-run of the release job after a partial failure would
//      otherwise hit E409 (version already exists) and fail the whole release.
//      Here an already-published version is a no-op.
//   2. `--ignore-scripts`. `npm publish` would otherwise run this package's
//      `prepare` script (= `tsup`), rebuilding at publish time. The workflow
//      already built and passed `dist/` in as an artifact, so a rebuild here
//      is at best redundant and at worst publishes something the CI checks
//      never saw.
//
// Auth is npm Trusted Publishing (OIDC), so there is no NPM_TOKEN. That
// requires npm >= 11.6.0 and a trusted publisher configured for this package
// on npmjs.com.

import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { name, version } = JSON.parse(readFileSync(pkgPath, 'utf8'));

let published = '';
try {
  published = execFileSync('npm', ['view', name, 'version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  // Package may not exist on the registry yet - treat as unpublished.
}

if (published === version) {
  console.log(`${name}@${version} is already on the registry, nothing to do`);
  process.exit(0);
}

console.log(`Publishing ${name}@${version} (registry currently at: ${published || 'none'})`);

const result = spawnSync(
  'npm',
  ['publish', '--access', 'public', '--provenance', '--ignore-scripts'],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Create the tag `changeset publish` would have created. changesets/action
// reads the `New tag:` line below, then pushes `v<version>` to origin and
// creates a GitHub release for it; that push fails if the tag does not exist
// locally. Non-fatal when it already exists, so re-runs stay safe.
const tagResult = spawnSync('git', ['tag', `v${version}`], { stdio: 'inherit' });
if (tagResult.status !== 0) {
  console.log(`Note: git tag v${version} could not be created (already exists?)`);
}

// The line changesets/action looks for, so its `publishedPackages` output is
// populated for downstream consumers.
console.log(`New tag: ${name}@${version}`);
