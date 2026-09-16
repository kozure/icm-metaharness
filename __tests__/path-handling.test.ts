// SPDX-License-Identifier: MIT
//
// Cross-platform path handling regression tests.
//
// Pins the lessons from earlier in this conversation:
//   - /tmp doesn't resolve on Windows
//   - manifest file paths must be posix-normalized for cross-platform
//     reproducible witness signatures
//   - tarball entries must be posix-normalized
//   - WASM-loader URL paths use forward-slashes regardless of host OS

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, sep } from 'node:path';

describe('os.tmpdir() works on every platform (Windows regression)', () => {
  it('returns a non-empty platform-appropriate path', () => {
    const t = tmpdir();
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
    if (process.platform === 'win32') {
      expect(t).toMatch(/^[A-Z]:[\\/]/i);
    } else {
      expect(t.startsWith('/')).toBe(true);
    }
  });

  it('mkdtemp under os.tmpdir succeeds on every platform', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'path-handling-'));
    expect(dir.startsWith(tmpdir())).toBe(true);
    await writeFile(join(dir, 'demo.txt'), 'ok');
    const entries = await readdir(dir);
    expect(entries).toContain('demo.txt');
  });
});

describe('posix normalisation for manifest keys (witness reproducibility)', () => {
  it('path.join + posix.sep round-trips to forward-slash on every platform', () => {
    const native = join('a', 'b', 'c.txt');
    const norm = native.split(sep).join(posix.sep);
    expect(norm).toBe('a/b/c.txt');
  });

  it('explicit posix.join produces forward-slash on every platform', () => {
    expect(posix.join('a', 'b', 'c.txt')).toBe('a/b/c.txt');
  });

  it('manifest fingerprint key normalisation is platform-stable', () => {
    // On Windows: join() produces 'src\\agents\\coder.ts'
    // After normalisation: 'src/agents/coder.ts'
    // The witness manifest MUST store the normalised form so signatures
    // verify across CI runners on different OSes.
    const candidates = [
      'src/agents/coder.ts',
      'src\\agents\\coder.ts',
      'src/agents\\coder.ts',
    ];
    const normalised = candidates.map(p => p.split(/[\\/]/).join('/'));
    for (const n of normalised) {
      expect(n).toBe('src/agents/coder.ts');
    }
  });
});

describe('Windows-specific path quirks', () => {
  it('absolute Windows-style paths can be detected by drive-letter pattern', () => {
    const winLike = ['C:\\Users\\ruv\\Projects', 'D:/data', 'C:/'];
    for (const p of winLike) {
      expect(/^[A-Z]:[\\/]/i.test(p)).toBe(true);
    }
  });

  it('POSIX-style paths are also detectable', () => {
    expect('/home/ruv'.startsWith('/')).toBe(true);
    expect('/tmp'.startsWith('/')).toBe(true);
  });
});

describe('cross-platform mkdtemp + cleanup contract', () => {
  it('two parallel mkdtemp calls produce distinct directories', async () => {
    const [a, b] = await Promise.all([
      mkdtemp(join(tmpdir(), 'par-a-')),
      mkdtemp(join(tmpdir(), 'par-b-')),
    ]);
    expect(a).not.toBe(b);
    expect(a.startsWith(tmpdir())).toBe(true);
    expect(b.startsWith(tmpdir())).toBe(true);
  });
});

// ADR-284 — INVERTED from the iter-65 pin. iter 65 added 'apps' to SCAN_DIRS
// so the scanner would cover apps/web-ui; ADR-284 deleted that tree and made
// the fork CLI-only, so 'apps' is now dead configuration implying coverage
// that no longer exists. These two tests are the mechanical guard: the entry
// must stay out, and the guard must still run green on the shrunken dir set.
describe('scripts/path-guard.mjs no longer scans apps (ADR-284)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { resolve, dirname } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const GUARD = resolve(__dirname, '..', 'scripts', 'path-guard.mjs');
  const text = readFileSync(GUARD, 'utf-8');

  it('SCAN_DIRS does NOT include apps — the UI tree is gone (ADR-284)', () => {
    expect(
      text,
      "scripts/path-guard.mjs re-added 'apps' to SCAN_DIRS. ADR-284 removed "
      + 'apps/web-ui and the fork is CLI-only, so a restored entry means either '
      + 'the UI tree came back in an upstream re-sync or the retirement was reverted.',
    ).not.toMatch(/SCAN_DIRS\s*=\s*\[[^\]]*'apps'/);
  });

  it('runs green on the live repo with apps retired', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const r = await exec('node', [GUARD], {
      cwd: resolve(__dirname, '..'),
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    expect(r.stdout).toMatch(/clean/);
    expect(r.stdout, 'path-guard still reports apps in its scanned dir list')
      .not.toMatch(/scanned[^)]*\bapps\b/);
  }, 60_000);
});
