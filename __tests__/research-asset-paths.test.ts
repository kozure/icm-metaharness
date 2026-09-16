// SPDX-License-Identifier: MIT
//
// ADR-284 FR-7 guard. `swe-pareto.json` is research data, not UI code, but it
// lived inside the deleted `apps/web-ui/public/assets/` tree. It was relocated
// to `docs/research/`, and two root scripts read it.
//
// Matching the source string alone is not enough: a constant repointed at a
// path that does not exist would still match. So each declared path is also
// RESOLVED and the file it names is asserted to exist. That is the assertion
// that catches a half-finished relocation.

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = 'docs/research/swe-pareto.json';

/** Pull a single-quoted path literal out of a `const NAME = ...;` line. */
function declaredPath(script: string, constant: string): string {
  const source = readFileSync(join(ROOT, 'scripts', script), 'utf-8');
  const line = source.match(new RegExp(`^const ${constant} = .*$`, 'm'));
  expect(line, `${script}: no \`const ${constant} = …\` declaration found`).not.toBeNull();
  const literal = line![0].match(/'([^']+)'/);
  expect(literal, `${script}: \`${constant}\` declares no path literal`).not.toBeNull();
  return literal![1]!;
}

describe('ADR-284 FR-7 — the research asset survived the UI tree removal', () => {
  it('docs/research/swe-pareto.json exists and is tracked', async () => {
    expect(existsSync(join(ROOT, ASSET)), `${ASSET} is missing from the working tree`).toBe(true);
    const { stdout } = await exec('git', ['ls-files', ASSET], { cwd: ROOT, windowsHide: true });
    expect(stdout.trim(), `${ASSET} is not tracked by git`).toBe(ASSET);
    // It is still the research payload, not an empty placeholder.
    const data = JSON.parse(readFileSync(join(ROOT, ASSET), 'utf-8')) as { benchmarks?: unknown };
    expect(data.benchmarks, `${ASSET} carries no benchmarks payload`).toBeTruthy();
  });

  for (const [script, constant] of [
    ['nightly-sota-review.mjs', 'PARETO_PATH'],
    ['pareto-from-firestore.mjs', 'JSON_PATH'],
  ] as const) {
    it(`${script} declares ${constant} outside the removed UI tree, and it resolves`, () => {
      const declared = declaredPath(script, constant);
      expect(declared, `${script}: ${constant} still points into the removed UI tree`)
        .not.toMatch(/(^|[\\/])apps[\\/]/);
      // `nightly-sota-review.mjs` joins REPO; `pareto-from-firestore.mjs` uses a
      // repo-root-relative literal. Both resolve against the repo root here.
      const resolved = isAbsolute(declared) ? declared : join(ROOT, declared);
      expect(
        existsSync(resolved),
        `${script}: ${constant} = ${JSON.stringify(declared)} resolves to ${resolved}, which does not exist`,
      ).toBe(true);
    });
  }
});
