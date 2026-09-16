// SPDX-License-Identifier: MIT
//
// ADR-284 — the central invariant of the UI removal.
//
// Every other guard in this suite pins one consequence of the removal: a
// retired scan target, an absent workflow, a package that left the SBOM. This
// one pins the removal itself: NO TRACKED PATH may match a UI artifact
// pattern. It is derived from `git ls-files`, so it sees what the repository
// actually carries rather than what any script happens to look at, and it is
// the assertion an upstream re-sync trips first if it restores the tree.
//
// The failure message names the offending paths on purpose — a re-sync that
// reintroduces 50 files should read the violation directly, not go hunting.

import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each pattern, with what it guards, for a message a reader can act on. */
const UI_ARTIFACTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^apps\/web-ui\//, 'the Agent Harness Studio SPA'],
  [/^docs\/web-ui\//, "the Studio's screenshot record"],
  [/^__tests__\/browser-smoke\//, 'the manual browser-smoke fixture'],
  [/arc-widget\.html$/, 'the ARC MCP Apps widget'],
  [/^\.github\/workflows\/pages.*\.yml$/, 'a GitHub Pages workflow'],
];

describe('ADR-284 — no UI artifact is tracked in this repository', () => {
  let tracked: string[];

  beforeAll(async () => {
    const { stdout } = await exec('git', ['ls-files'], {
      cwd: ROOT,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    tracked = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  }, 60_000);

  it('git ls-files returns a non-empty list (the guard is actually looking)', () => {
    // Without this, a `git ls-files` that failed or returned nothing would make
    // every assertion below pass vacuously — the exact failure mode ADR-284's
    // audit caught in audit-deps.test.ts.
    expect(tracked.length, 'git ls-files returned nothing — the guard cannot see the repo')
      .toBeGreaterThan(100);
  });

  for (const [pattern, what] of UI_ARTIFACTS) {
    it(`tracks no path matching ${pattern} (${what})`, () => {
      const offenders = tracked.filter((path) => pattern.test(path));
      expect(
        offenders,
        `ADR-284 violation — ${offenders.length} tracked path(s) match ${pattern} (${what}):\n`
        + offenders.map((path) => `  ${path}`).join('\n')
        + '\n\nThis fork is CLI-only. The UI was permanently removed and must not be '
        + 'reinstated by an upstream re-sync. If a re-sync brought these back, delete '
        + 'them again per FORK-RESYNC.md rather than adjusting this test.',
      ).toEqual([]);
    });
  }

  it('tracks none of them, taken together (the whole-removal assertion)', () => {
    const offenders = tracked.filter((path) =>
      UI_ARTIFACTS.some(([pattern]) => pattern.test(path)));
    expect(
      offenders,
      `ADR-284 violation — ${offenders.length} UI artifact path(s) are tracked:\n`
      + offenders.map((path) => `  ${path}`).join('\n'),
    ).toEqual([]);
  });
});
