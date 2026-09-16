// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'healthcheck.mjs');

async function run(args: string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const r = await execFile('node', [SCRIPT, ...args], { cwd: ROOT, windowsHide: true });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('scripts/healthcheck.mjs', () => {
  it('the script exists', () => expect(existsSync(SCRIPT)).toBe(true));

  it('default run exits 0 with HEALTHY on the live repo', async () => {
    const r = await run();
    expect(r.code, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stderr).toMatch(/Result: HEALTHY/);
  }, 30_000);

  // ADR-284 — INVERTED from 8 checks to 7. The `pages` check probed the live
  // Studio at an upstream origin this fork does not deploy; it was removed with
  // the UI, along with STUDIO_URL and --probe-pages. Verified against
  // `Object.keys(CHECKS)` in scripts/healthcheck.mjs.
  it('runs all 7 checks by default (ADR-284 retired the pages probe)', async () => {
    const r = await run();
    expect(r.stderr).toMatch(/healthcheck — 7 checks/);
    for (const name of ['version', 'plugin', 'codex', 'workflows', 'pathguard', 'examples', 'catalogCount']) {
      expect(r.stderr).toContain(name);
    }
    expect(
      r.stderr,
      'the `pages` check is back in healthcheck.mjs. ADR-284 removed it with '
      + 'the Studio it probed — a restored check means the dead probe of a '
      + 'third-party origin came back.',
    ).not.toMatch(/\bpages\b/);
  }, 30_000);

  it('--json emits parseable JSON with results array + ok boolean', async () => {
    const r = await run(['--json']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results).toHaveLength(7);   // ADR-284: was 8, minus `pages`
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.ok).toBe(true);
  }, 30_000);

  // iter 86: cross-language template-count check.
  it('catalogCount agrees across catalog.json + TS test + Rust test', async () => {
    const r = await run(['--check=catalogCount']);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/PASS\s+catalogCount/);
    // Output mentions all three sources
    expect(r.stderr).toMatch(/JSON \+ TS test \+ Rust test/);
  }, 30_000);

  it('catalogCount surfaces the count in the detail line', async () => {
    const r = await run(['--check=catalogCount']);
    // Pin that the number 17 (or whatever the current count is) appears
    // in the human output — useful for grep-on-deploy verification.
    expect(r.stderr).toMatch(/\d+ templates in JSON/);
  }, 30_000);

  it('--check=plugin runs only the plugin check', async () => {
    const r = await run(['--check=plugin']);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/healthcheck — 1 check/);
    expect(r.stderr).toMatch(/PASS\s+plugin/);
  }, 30_000);

  it('unknown --check= produces a FAIL not a crash', async () => {
    const r = await run(['--check=nonexistent']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unknown check/);
  }, 30_000);

  it('finishes fast (<5 seconds, no I/O beyond reading files)', async () => {
    const t0 = Date.now();
    await run();
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 30_000);

  // ADR-284 — INVERTED from the iter-72 pins. Both tests named the `pages`
  // check, which no longer exists. Rather than delete them, they now assert
  // that `--check=pages` takes the unknown-check error path: that keeps the
  // flag's error handling covered AND makes the check's absence mechanical.
  it('--check=pages is now an UNKNOWN check, not a SKIP (ADR-284)', async () => {
    const r = await run(['--check=pages']);
    expect(
      r.code,
      'healthcheck still knows a `pages` check. ADR-284 removed it along with '
      + 'STUDIO_URL and --probe-pages; if it resolves, the dead Studio probe is back.',
    ).toBe(1);
    expect(r.stderr).toMatch(/unknown check/);
  }, 30_000);

  it('healthcheck no longer accepts --probe-pages (ADR-284)', async () => {
    // The flag is gone, so it must be inert: passing it changes nothing and
    // the default 7-check run still reports HEALTHY.
    const r = await run(['--probe-pages']);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/healthcheck — 7 checks/);
    expect(r.stderr).toMatch(/Result: HEALTHY/);
  }, 30_000);
});
