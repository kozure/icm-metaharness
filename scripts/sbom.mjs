#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// scripts/sbom.mjs — Software Bill of Materials generator.
//
// Emits SPDX-2.3-compatible JSON listing every npm + cargo dependency
// with version + license + source. Useful for:
//   - regulated industries that require provenance
//   - enterprise procurement reviews
//   - CI artifact for downstream auditors
//   - IPFS pin alongside the marketplace entry (iter 27)
//
// Run:
//   node scripts/sbom.mjs > dist/sbom.json
//   node scripts/sbom.mjs --validate-only      # no output, just verify shape
//   node scripts/sbom.mjs --include-dev        # include dev deps too
//
// Reads:
//   package-lock.json    (npm dep tree)
//   Cargo.lock           (cargo dep tree, if present)

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const INCLUDE_DEV = args.includes('--include-dev');
const VALIDATE_ONLY = args.includes('--validate-only');
const OUT_FLAG = args.find(a => a.startsWith('--out='))?.slice('--out='.length);

function log(tag, msg) { process.stderr.write(`[sbom] ${tag}: ${msg}\n`); }

function spdxId(prefix, name) {
  return `SPDXRef-${prefix}-${name.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

function packageVerificationCode(versionCount) {
  // SPDX requires a hex hash; without unpacking every tarball, we use a
  // stable composition of the version set as a proxy.
  return createHash('sha1').update(`v=${versionCount}`).digest('hex');
}

async function readNpmLock(path = join(ROOT, 'package-lock.json')) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (e) {
    log('WARN', `failed to parse ${path}: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * iter 64: known-but-non-workspace package trees whose deps belong in the
 * SBOM. Empty since ADR-284 removed apps/web-ui, the only one this fork
 * ever had; the existsSync filter below tolerates the empty list. Add a
 * dir here if a non-workspace tree with its own lockfile ever returns.
 */
const EXTRA_LOCK_DIRS = [];

async function readExtraNpmLocks() {
  const out = [];
  for (const dir of EXTRA_LOCK_DIRS) {
    const path = join(ROOT, dir, 'package-lock.json');
    if (!existsSync(path)) continue;
    const lock = await readNpmLock(path);
    if (lock) out.push({ dir, lock });
  }
  return out;
}

async function readCargoLock() {
  const path = join(ROOT, 'Cargo.lock');
  if (!existsSync(path)) return null;
  try {
    return await readFile(path, 'utf-8');
  } catch (e) {
    log('WARN', `failed to read Cargo.lock: ${e?.message ?? e}`);
    return null;
  }
}

/** Parse Cargo.lock (TOML-ish; we just need [[package]] blocks). */
function parseCargoLock(text) {
  const entries = [];
  const blocks = text.split(/\n\[\[package\]\]\n/).slice(1);  // skip preamble
  for (const block of blocks) {
    const entry = {};
    for (const line of block.split('\n')) {
      if (!line.includes('=')) break;
      const m = line.match(/^(\w+)\s*=\s*"(.+)"$/);
      if (m) entry[m[1]] = m[2];
    }
    if (entry.name && entry.version) {
      entries.push({
        name: entry.name,
        version: entry.version,
        source: entry.source ?? 'registry+https://github.com/rust-lang/crates.io-index',
      });
    }
  }
  return entries;
}

function npmEntries(lock) {
  if (!lock?.packages) return [];
  const out = [];
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (!path || path === '') continue;  // skip root self-entry
    if (!INCLUDE_DEV && pkg.dev === true) continue;
    if (pkg.peer === true || pkg.optional === true) continue;  // optional/peer-only
    const name = pkg.name ?? path.split('node_modules/').pop();
    if (!name || !pkg.version) continue;
    out.push({
      name,
      version: pkg.version,
      license: pkg.license ?? 'NOASSERTION',
      source: pkg.resolved ?? 'NOASSERTION',
      integrity: pkg.integrity ?? 'NOASSERTION',
    });
  }
  return out;
}

function buildSpdx(npm, cargo) {
  const now = new Date(0).toISOString();  // deterministic for reproducible builds
  const npmPkgs = npm.map(p => ({
    SPDXID: spdxId('npm', p.name + '-' + p.version),
    name: p.name,
    versionInfo: p.version,
    downloadLocation: p.source,
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: typeof p.license === 'string' ? p.license : 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    checksums: [{ algorithm: 'SHA1', checksumValue: createHash('sha1').update(p.integrity ?? `${p.name}@${p.version}`).digest('hex') }],
    externalRefs: [{
      referenceCategory: 'PACKAGE-MANAGER',
      referenceType: 'purl',
      referenceLocator: `pkg:npm/${p.name}@${p.version}`,
    }],
  }));
  const cargoPkgs = cargo.map(p => ({
    SPDXID: spdxId('cargo', p.name + '-' + p.version),
    name: p.name,
    versionInfo: p.version,
    downloadLocation: p.source,
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: 'NOASSERTION',  // cargo lockfile doesn't carry license
    copyrightText: 'NOASSERTION',
    externalRefs: [{
      referenceCategory: 'PACKAGE-MANAGER',
      referenceType: 'purl',
      referenceLocator: `pkg:cargo/${p.name}@${p.version}`,
    }],
  }));
  const allPkgs = [...npmPkgs, ...cargoPkgs];
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'agent-harness-generator-sbom',
    documentNamespace: `https://github.com/ruvnet/agent-harness-generator/sbom-${packageVerificationCode(allPkgs.length).slice(0, 16)}`,
    creationInfo: {
      created: now,
      creators: ['Tool: scripts/sbom.mjs (iter 50)'],
      licenseListVersion: '3.20',
    },
    packages: allPkgs,
  };
}

export function validateSpdx(doc) {
  const problems = [];
  if (doc.spdxVersion !== 'SPDX-2.3') problems.push(`bad spdxVersion: ${doc.spdxVersion}`);
  if (doc.SPDXID !== 'SPDXRef-DOCUMENT') problems.push(`bad SPDXID: ${doc.SPDXID}`);
  if (!doc.creationInfo?.created) problems.push('missing creationInfo.created');
  if (!Array.isArray(doc.packages)) problems.push('packages is not an array');
  else {
    for (const [i, p] of doc.packages.entries()) {
      if (!p.SPDXID?.startsWith('SPDXRef-')) problems.push(`packages[${i}].SPDXID malformed`);
      if (!p.name) problems.push(`packages[${i}].name missing`);
      if (!p.versionInfo) problems.push(`packages[${i}].versionInfo missing`);
      if (!Array.isArray(p.externalRefs) || p.externalRefs.length === 0) {
        problems.push(`packages[${i}].externalRefs empty`);
      } else if (!p.externalRefs[0].referenceLocator?.startsWith('pkg:')) {
        problems.push(`packages[${i}].externalRefs[0].referenceLocator not a purl`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export async function buildSbomFromRepo() {
  const npmLock = await readNpmLock();
  const cargoLock = await readCargoLock();
  const extraLocks = await readExtraNpmLocks();
  // iter 64: dedupe by name@version since extra trees often share
  // transitive deps with the root workspace. Keep the first occurrence
  // so the workspace's resolved/integrity stays authoritative.
  const seen = new Set();
  const npm = [];
  for (const source of [{ dir: '.', lock: npmLock }, ...extraLocks]) {
    if (!source.lock) continue;
    for (const e of npmEntries(source.lock)) {
      const key = `${e.name}@${e.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      npm.push(e);
    }
  }
  const cargo = cargoLock ? parseCargoLock(cargoLock) : [];
  return buildSpdx(npm, cargo);
}

async function main() {
  const doc = await buildSbomFromRepo();
  const v = validateSpdx(doc);
  log('INFO', `SPDX has ${doc.packages.length} packages (validation ${v.ok ? 'OK' : 'BROKEN'})`);
  if (!v.ok) {
    for (const p of v.problems.slice(0, 5)) log('FAIL', p);
    process.exit(1);
  }
  if (VALIDATE_ONLY) {
    log('INFO', 'validate-only mode — no output written');
    return;
  }
  if (OUT_FLAG) {
    const out = join(ROOT, OUT_FLAG);
    await mkdir(join(ROOT, OUT_FLAG.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    await writeFile(out, JSON.stringify(doc, null, 2) + '\n');
    log('INFO', `wrote ${out}`);
    return;
  }
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
}

// If invoked directly (not imported), run main. ESM equivalent of
// `require.main === module`.
const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || import.meta.url.endsWith('/sbom.mjs');
if (isMain) {
  main().catch(err => {
    log('FAIL', err?.stack ?? err);
    process.exit(1);
  });
}
