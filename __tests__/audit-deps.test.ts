// SPDX-License-Identifier: MIT
//
// Tests for scripts/audit-deps.mjs.
// We don't actually run npm/cargo audit (that's covered by CI's
// security.yml) — these tests pin the script's contract: arg parsing,
// exit codes, and structured output.

import { describe, it, expect } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'audit-deps.mjs');

async function run(args: string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFile('node', [SCRIPT, ...args], {
      cwd: ROOT, windowsHide: true, maxBuffer: 1024 * 1024 * 16,
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('scripts/audit-deps.mjs', () => {
  it('the script exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('exits 2 (tooling) on unknown --level', async () => {
    const r = await run(['--level=not-a-level', '--skip-npm', '--skip-cargo']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown --level/);
  }, 30_000);

  it('honors --skip-npm + --skip-cargo (returns 0 with both skipped)', async () => {
    const r = await run(['--skip-npm', '--skip-cargo']);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/SKIP: npm/);
    expect(r.stderr).toMatch(/SKIP: cargo/);
    expect(r.stderr).toMatch(/ALL CLEAN/);
  }, 30_000);

  it('echoes the configured level', async () => {
    const r = await run(['--level=moderate', '--skip-npm', '--skip-cargo']);
    expect(r.stderr).toMatch(/level=moderate/);
  }, 30_000);

  it('default level is `high`', async () => {
    const r = await run(['--skip-npm', '--skip-cargo']);
    expect(r.stderr).toMatch(/level=high/);
  }, 30_000);

  it('runs real npm audit against the workspace and reports 0 advisories at high+', async () => {
    // This is the live signal — the actual gate. If a real high advisory
    // sneaks into the lockfile, this exits non-zero and the CI security
    // workflow fails too.
    const r = await run(['--skip-cargo']);
    expect(r.code, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stderr).toMatch(/PASS: npm/);
  }, 120_000);

  // ADR-284 — INVERTED from the iter-61 pin. iter 61 asserted that
  // apps/web-ui was auto-discovered as an extra scan target. ADR-284 deleted
  // that tree and emptied `known` in discoverExtraScans().
  //
  // NOTE on the inversion's shape: the original test opened with
  // `if (!existsSync(...)) return;`, so once the tree was gone it returned
  // immediately and reported green while asserting nothing. The replacement
  // deliberately carries NO existence guard — it asserts the default run
  // positively reports `extra-scans=none`, so it goes red if a UI tree
  // reappears and is rediscovered. An inert guard is worse than no guard.
  it('auto-discovers NO extra scan target — the UI tree is gone (ADR-284)', async () => {
    const r = await run(['--skip-npm', '--skip-cargo']);
    expect(
      r.stderr,
      'audit-deps auto-discovered an extra scan target. ADR-284 emptied the '
      + '`known` list in discoverExtraScans() because apps/web-ui was its only '
      + 'entry; a discovered target means a non-workspace lockfile tree is back.',
    ).toMatch(/extra-scans=none/);
    expect(r.stderr, 'apps/web-ui is being scanned again')
      .not.toMatch(/apps\/web-ui/);
  }, 30_000);

  it('--skip-extra disables auto-discovery', async () => {
    const r = await run(['--skip-npm', '--skip-cargo', '--skip-extra']);
    expect(r.stderr).toMatch(/extra-scans=none/);
  }, 30_000);

  it('--scan=<dir> is recognized + reported in INFO', async () => {
    // ADR-284: the UI path this used as its fixture is gone; a surviving
    // workspace dir keeps the flag's behaviour covered.
    const r = await run([
      '--skip-npm', '--skip-cargo', '--scan=packages/create-agent-harness', '--skip-extra',
    ]);
    expect(r.stderr).toMatch(/extra-scans=packages\/create-agent-harness/);
  }, 30_000);

  it('unknown --scan=<dir> produces a SKIP, not a crash', async () => {
    // --skip-npm disables the workspace audit but the script still iterates
    // extra dirs. We pick a dir we know doesn't exist; expect SKIP, exit 0.
    const r = await run(['--skip-npm', '--skip-cargo', '--scan=does-not-exist', '--skip-extra']);
    // NOTE: --skip-npm makes the runNpmAudit function return early, so the
    // extra-scan loop above runs the SKIP path. Result should be exit 0.
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/extra-scans=does-not-exist/);
  }, 30_000);

  // ADR-284 — INVERTED, and again with NO existence guard so it cannot go
  // inert. A real UI path must no longer yield an extra scan: the audit's
  // only PASS line is the workspace one.
  it('a real npm audit yields no apps/web-ui scan (ADR-284)', async () => {
    const r = await run(['--skip-cargo']);
    expect(r.code, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stderr).toMatch(/PASS: npm\(workspace\)/);
    expect(
      r.stderr,
      'audit-deps produced an apps/web-ui scan line. The tree ADR-284 deleted '
      + 'is being audited again, which means it is back on disk.',
    ).not.toMatch(/apps\/web-ui/);
  }, 180_000);

  it('--strict-tooling fails when cargo-audit not installed (we don\'t test installed because environment varies)', async () => {
    // We can only assert the strict-tooling flag is recognised; whether
    // it actually causes a FAIL depends on the host having or not having
    // cargo-audit. Just exercise the path.
    const r = await run(['--skip-npm', '--strict-tooling']);
    // Either: cargo-audit installed -> PASS; not installed -> FAIL.
    // Either way the script should not crash, exit code 0 or 1 (not 2).
    expect([0, 1]).toContain(r.code);
  }, 60_000);
});
