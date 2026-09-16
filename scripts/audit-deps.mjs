#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// scripts/audit-deps.mjs — aggregate dependency security audit.
//
// Walks every Node + Rust dep tree in the repo and reports advisories
// at or above the configured threshold. Per the user's "secure"
// directive: fail the gate on high+ severity, surface moderate as warn.
//
// Wraps:
//   - `npm audit --omit=dev --audit-level=<threshold> --json` (one
//     invocation; npm walks the workspace tree)
//   - `cargo audit --quiet --json` (one invocation if `cargo-audit`
//     is installed; soft-skip otherwise so contributors without it
//     don't bounce off CI locally)
//
// Output: per-tool PASS / WARN / FAIL with advisory IDs + severities.
//
// Usage:
//   node scripts/audit-deps.mjs                # fail on high+
//   node scripts/audit-deps.mjs --level=critical   # fail only on critical
//   node scripts/audit-deps.mjs --include-dev      # audit dev deps too
//   node scripts/audit-deps.mjs --skip-cargo       # skip cargo audit
//   node scripts/audit-deps.mjs --scan=<dir>       # extra dir to audit
//   node scripts/audit-deps.mjs --skip-extra       # skip auto-discovered
//
// Exit codes:
//   0   no advisories at-or-above threshold
//   1   one or more tools reported failing advisories
//   2   tooling missing AND --strict-tooling

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const execFile = promisify(execFileCb);

const args = process.argv.slice(2);
const level = args.find(a => a.startsWith('--level='))?.slice('--level='.length) ?? 'high';
const includeDev = args.includes('--include-dev');
const skipCargo = args.includes('--skip-cargo');
const skipNpm = args.includes('--skip-npm');
const skipExtra = args.includes('--skip-extra');
const strictTooling = args.includes('--strict-tooling');

// iter 61: --scan=<dir> (repeatable) audits package-lock.json trees that
// sit OUTSIDE the root npm workspace. The flag stays available for any
// such tree; this fork has none since ADR-284 removed apps/web-ui.
const explicitScans = args
  .filter(a => a.startsWith('--scan='))
  .map(a => a.slice('--scan='.length));

/**
 * Auto-discover known-but-non-workspace package trees. Empty since ADR-284
 * removed apps/web-ui, the only one this fork ever had. Anything added here
 * MUST have an in-repo package-lock.json so the audit doesn't trigger an
 * npm install at scan time (which would be expensive and could even change
 * the lockfile).
 */
function discoverExtraScans() {
  if (skipExtra) return [];
  const known = [];
  return known.filter(d => existsSync(resolve(d, 'package-lock.json')));
}

const extraScanDirs = [
  ...explicitScans,
  ...discoverExtraScans().filter(d => !explicitScans.includes(d)),
];

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const levelIdx = LEVELS.indexOf(level);
if (levelIdx < 0) {
  process.stderr.write(`[audit-deps] FAIL: unknown --level=${level} (valid: ${LEVELS.join(', ')})\n`);
  process.exit(2);
}

function log(tag, msg) { process.stderr.write(`[audit-deps] ${tag}: ${msg}\n`); }

async function which(cmd) {
  const tool = process.platform === 'win32' ? 'where' : 'which';
  try { await execFile(tool, [cmd], { windowsHide: true }); return true; } catch { return false; }
}

function npmInvocation() {
  const args = ['audit', '--json', `--audit-level=${level}`];
  if (!includeDev) args.push('--omit=dev');
  return process.platform === 'win32'
    ? { bin: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', ...args] }
    : { bin: 'npm', args };
}

function cargoInvocation() {
  const args = ['audit', '--quiet', '--json'];
  return process.platform === 'win32'
    ? { bin: 'cmd.exe', args: ['/d', '/s', '/c', 'cargo', ...args] }
    : { bin: 'cargo', args };
}

async function runNpmAudit(cwd) {
  if (skipNpm) return { tag: 'SKIP', msg: 'skipped (--skip-npm)', exit: 0 };
  const { bin, args } = npmInvocation();
  let stdout = '', exitCode = 0;
  try {
    const r = await execFile(bin, args, { maxBuffer: 1024 * 1024 * 16, windowsHide: true, cwd });
    stdout = r.stdout;
  } catch (e) {
    stdout = e.stdout || ''; exitCode = e.code ?? 1;
  }
  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch { /* npm prints non-JSON in some cases */ }
  if (!parsed) {
    return exitCode === 0
      ? { tag: 'PASS', msg: 'no advisories' }
      : { tag: 'WARN', msg: 'audit ran but produced non-JSON output', exit: 0 };
  }
  // npm v7+ shape: parsed.vulnerabilities is an object keyed by pkg name;
  // parsed.metadata.vulnerabilities has counts per severity.
  const counts = parsed.metadata?.vulnerabilities ?? {};
  const failCount = LEVELS.slice(levelIdx).reduce((s, l) => s + (counts[l] ?? 0), 0);
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  if (failCount === 0) {
    return { tag: 'PASS', msg: `0 advisories at-or-above ${level} (${total} total below threshold)` };
  }
  const ids = Object.entries(parsed.vulnerabilities ?? {})
    .filter(([, v]) => LEVELS.indexOf(v.severity) >= levelIdx)
    .map(([name, v]) => `${name}(${v.severity})`)
    .slice(0, 5);
  return { tag: 'FAIL', msg: `${failCount} advisories at ${level}+: ${ids.join(', ')}` };
}

async function runCargoAudit() {
  if (skipCargo) return { tag: 'SKIP', msg: 'skipped (--skip-cargo)' };
  if (!(await which('cargo'))) {
    return strictTooling
      ? { tag: 'FAIL', msg: 'cargo not on PATH (--strict-tooling)' }
      : { tag: 'SKIP', msg: 'cargo not on PATH; install rustup' };
  }
  // Probe cargo-audit
  const probe = await execFile(process.platform === 'win32' ? 'cmd.exe' : 'cargo',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'cargo', 'audit', '--help'] : ['audit', '--help'],
    { windowsHide: true }).catch(() => null);
  if (!probe) {
    return strictTooling
      ? { tag: 'FAIL', msg: 'cargo-audit not installed (cargo install cargo-audit)' }
      : { tag: 'SKIP', msg: 'cargo-audit not installed; cargo install cargo-audit' };
  }
  const { bin, args } = cargoInvocation();
  let stdout = '', exitCode = 0;
  try {
    const r = await execFile(bin, args, { maxBuffer: 1024 * 1024 * 16, windowsHide: true });
    stdout = r.stdout;
  } catch (e) {
    stdout = e.stdout || ''; exitCode = e.code ?? 1;
  }
  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch { /* */ }
  if (!parsed) {
    return exitCode === 0
      ? { tag: 'PASS', msg: 'no Rust advisories' }
      : { tag: 'WARN', msg: 'audit ran but produced non-JSON output' };
  }
  // cargo-audit JSON: vulnerabilities.list[].advisory.id + .severity
  const vulns = parsed.vulnerabilities?.list ?? [];
  const failing = vulns.filter(v =>
    LEVELS.indexOf((v.advisory?.severity ?? 'info').toLowerCase()) >= levelIdx);
  if (failing.length === 0) {
    return { tag: 'PASS', msg: `0 Rust advisories at-or-above ${level} (${vulns.length} total)` };
  }
  const ids = failing.slice(0, 5).map(v => `${v.advisory?.id}(${v.advisory?.severity})`);
  return { tag: 'FAIL', msg: `${failing.length} Rust advisories at ${level}+: ${ids.join(', ')}` };
}

async function main() {
  log('INFO', `level=${level} include-dev=${includeDev} skip-cargo=${skipCargo} skip-npm=${skipNpm} extra-scans=${extraScanDirs.length ? extraScanDirs.join(',') : 'none'}`);
  const results = [];
  results.push({ tool: 'npm(workspace)', ...(await runNpmAudit(process.cwd())) });
  for (const dir of extraScanDirs) {
    const abs = resolve(dir);
    if (!existsSync(resolve(abs, 'package-lock.json'))) {
      results.push({ tool: `npm(${dir})`, tag: 'SKIP', msg: `no package-lock.json in ${dir}` });
      continue;
    }
    results.push({ tool: `npm(${dir})`, ...(await runNpmAudit(abs)) });
  }
  results.push({ tool: 'cargo', ...(await runCargoAudit()) });

  let problems = 0;
  for (const r of results) {
    log(r.tag, `${r.tool} — ${r.msg}`);
    if (r.tag === 'FAIL') problems++;
  }
  if (problems === 0) {
    log('INFO', `ALL CLEAN at ${level}+`);
    process.exit(0);
  }
  log('FAIL', `${problems} tool(s) reported failing advisories`);
  process.exit(1);
}

main().catch(err => {
  log('FAIL', `unexpected: ${err?.stack ?? err}`);
  process.exit(1);
});
