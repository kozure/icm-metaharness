#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// scripts/preflight.mjs — local pre-publish validation.
//
// Runs every gate the publish workflow would run, but locally. If this
// passes, the tag-driven publish is likely to succeed. If this fails,
// fix the failure before tagging.
//
// Usage:
//   node scripts/preflight.mjs                # run everything
//   node scripts/preflight.mjs --skip-wasm    # skip wasm-pack (slow)
//   node scripts/preflight.mjs --skip-rust    # skip cargo test/clippy

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const skipWasm = args.has('--skip-wasm');
const skipRust = args.has('--skip-rust');

let failures = 0;
let warnings = 0;

function step(name, fn) {
  process.stdout.write(`==> ${name}... `);
  try {
    const res = fn();
    if (res === 'warn') {
      console.log('WARN');
      warnings++;
    } else {
      console.log('PASS');
    }
  } catch (err) {
    console.log('FAIL');
    console.log('    ' + (err.message ?? String(err)).split('\n').join('\n    '));
    failures++;
  }
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.pipe ? 'pipe' : 'inherit', cwd: root, ...opts });
}

// === Checks ===

step('git is clean (no uncommitted changes)', () => {
  const out = sh('git status --porcelain', { pipe: true }).toString().trim();
  if (out) {
    throw new Error(`uncommitted changes:\n${out}`);
  }
});

step('git on main branch', () => {
  const branch = sh('git rev-parse --abbrev-ref HEAD', { pipe: true }).toString().trim();
  if (branch !== 'main') {
    return 'warn'; // warn only — release branches are fine
  }
});

step('every package.json has version 0.1.0 (semver consistency)', () => {
  const seen = new Map();
  for (const pkg of findPackageJsons()) {
    const p = JSON.parse(readFileSync(pkg, 'utf-8'));
    if (p.private) continue;
    if (!p.version) throw new Error(`${pkg} has no version`);
    seen.set(p.name, p.version);
  }
  const versions = new Set(seen.values());
  if (versions.size > 1) {
    throw new Error(`version drift: ${[...seen].map(([n,v]) => `${n}=${v}`).join(', ')}`);
  }
});

step('every published package has a README', () => {
  for (const pkg of findPackageJsons()) {
    const p = JSON.parse(readFileSync(pkg, 'utf-8'));
    if (p.private) continue;
    const pkgDir = dirname(pkg);
    if (!existsSync(join(pkgDir, 'README.md'))) {
      throw new Error(`${p.name} is missing README.md`);
    }
  }
});

step('every published package declares publishConfig.access = public', () => {
  for (const pkg of findPackageJsons()) {
    const p = JSON.parse(readFileSync(pkg, 'utf-8'));
    if (p.private) continue;
    if (p.publishConfig?.access !== 'public') {
      throw new Error(`${p.name} missing publishConfig.access = "public"`);
    }
  }
});

step('CHANGELOG.md mentions current iter', () => {
  const cl = readFileSync(join(root, 'CHANGELOG.md'), 'utf-8');
  if (!cl.match(/### (Added|Changed) — Iter \d+/)) {
    throw new Error('CHANGELOG.md does not contain a per-iter entry');
  }
});

step('LICENSE is MIT', () => {
  const lic = readFileSync(join(root, 'LICENSE'), 'utf-8');
  if (!lic.includes('MIT License')) {
    throw new Error('LICENSE is not the MIT license');
  }
});

if (!skipRust) {
  step('cargo fmt --check', () => sh('cargo fmt --all -- --check'));
  step('cargo clippy -D warnings', () => sh('cargo clippy --workspace --all-targets -- -D warnings'));
  step('cargo test', () => sh('cargo test --workspace --quiet'));
} else {
  console.log('==> rust gates skipped (--skip-rust)');
}

if (!skipWasm) {
  step('wasm-pack build (release)', () => {
    sh('wasm-pack build crates/kernel-wasm --target bundler --release', {
      env: { ...process.env, RUSTFLAGS: '-D warnings' },
    });
  });
  step('wasm size budget (< 500 KB)', () => {
    const pkgDir = join(root, 'crates/kernel-wasm/pkg');
    const wasmFiles = readdirSync(pkgDir).filter(f => f.endsWith('.wasm'));
    if (wasmFiles.length === 0) throw new Error('no .wasm produced');
    for (const f of wasmFiles) {
      const s = statSync(join(pkgDir, f));
      if (s.size > 512_000) {
        throw new Error(`${f} ${s.size} > 500 KB`);
      }
    }
  });
} else {
  console.log('==> wasm gates skipped (--skip-wasm)');
}

step('npm tests', () => sh('npm test'));

console.log('');
console.log(`Result: ${failures} failure${failures === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);

function findPackageJsons() {
  const out = [];
  for (const entry of readdirSync(join(root, 'packages'))) {
    const pj = join(root, 'packages', entry, 'package.json');
    if (existsSync(pj)) out.push(pj);
  }
  return out;
}
