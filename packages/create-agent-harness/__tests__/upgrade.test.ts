// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planUpgrade, formatPlan, inlineConflictMarkers } from '../src/upgrade.js';
import { upgradeCmd } from '../src/upgrade-cmd.js';
import { sha256 } from '../src/manifest.js';
import { loadCatalog, resolveIcmDefault, templateDir } from '../src/index.js';
import { walkTemplate, asFileMap } from '../src/walker.js';

const PREREMOVAL_FIXTURE = join(
  __dirname, 'fixtures', 'icm-preremoval', '.harness', 'manifest.json',
);

const ICM_PATH = (p: string): boolean =>
  p === 'CONTEXT.md' || p === 'references/CONTEXT.md' || p.startsWith('stages/');

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'cah-upgrade-'));
  await mkdir(join(root, '.harness'), { recursive: true });
  return root;
}

describe('planUpgrade', () => {
  it('throws if .harness/manifest.json is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cah-empty-'));
    await expect(planUpgrade(root, {})).rejects.toThrow(/No \.harness/);
  });

  it('reports added/removed/clean-changed correctly', async () => {
    const root = await setup();
    await writeFile(join(root, '.harness', 'manifest.json'), JSON.stringify({
      schema: 1, generator: '0.1.0', template: 'minimal', template_version: '0.0.0',
      vars: {}, hosts: [], generated_at: '2026-06-13T00:00:00Z',
      files: {
        'a.txt': sha256('A v1'),
        'b.txt': sha256('B'),
        'removed.txt': sha256('R'),
      },
    }));
    // Local matches what manifest says was generated.
    await writeFile(join(root, 'a.txt'), 'A v1');
    await writeFile(join(root, 'b.txt'), 'B');
    await writeFile(join(root, 'removed.txt'), 'R');

    // Upstream introduced new.txt, kept b.txt, bumped a.txt, dropped removed.txt.
    const newFiles = {
      'a.txt': sha256('A v2'),
      'b.txt': sha256('B'),
      'new.txt': sha256('new!'),
    };

    const plan = await planUpgrade(root, newFiles);
    expect(plan.added).toEqual(['new.txt']);
    expect(plan.removed).toEqual(['removed.txt']);
    expect(plan.changed).toEqual([{ path: 'a.txt', kind: 'clean' }]);
  });

  it('detects a conflict when local has diverged', async () => {
    const root = await setup();
    await writeFile(join(root, '.harness', 'manifest.json'), JSON.stringify({
      schema: 1, generator: '0.1.0', template: 'minimal', template_version: '0.0.0',
      vars: {}, hosts: [], generated_at: '2026-06-13T00:00:00Z',
      files: { 'a.txt': sha256('A v1') },
    }));
    // User edited a.txt locally.
    await writeFile(join(root, 'a.txt'), 'A v1 plus local edits');
    // Upstream also changed a.txt.
    const plan = await planUpgrade(root, { 'a.txt': sha256('A v2 upstream') });
    expect(plan.changed).toEqual([{ path: 'a.txt', kind: 'conflict' }]);
  });
});

describe('formatPlan', () => {
  it('renders summary lines + lists conflicts', () => {
    const text = formatPlan({
      added: ['new.txt'],
      removed: ['old.txt'],
      changed: [
        { path: 'clean.txt', kind: 'clean' },
        { path: 'conflict.txt', kind: 'conflict' },
      ],
    });
    expect(text).toMatch(/1 added/);
    expect(text).toMatch(/1 removed/);
    expect(text).toMatch(/1 clean-overwrite/);
    expect(text).toMatch(/1 conflict/);
    expect(text).toMatch(/conflict\.txt/);
  });
});

describe('inlineConflictMarkers', () => {
  it('produces Git-style markers around current + upstream', () => {
    const out = inlineConflictMarkers('LOCAL', 'UPSTREAM');
    expect(out).toMatch(/<<<<<<< current/);
    expect(out).toMatch(/LOCAL/);
    expect(out).toMatch(/=======/);
    expect(out).toMatch(/UPSTREAM/);
    expect(out).toMatch(/>>>>>>> upstream/);
  });
});

// ---- task 5.2 / SC5: a pre-removal harness gains no ICM tree --------------
//
// The regression this pins: `upgrade` decides ICM-ness from the *manifest*
// (`icmEnabled`), not from the template's capability. If those two were merged
// — the "simplification" task 5.3 warns against — re-rendering this harness
// would emit the capable template's `.icm/` overlay and report every file as
// `added`, retro-adding a tree to a harness generated before ICM-by-default.
//
// The claim is deliberately narrow: **zero ICM files added or removed**. It is
// not "zero drift" — a `vertical:coding` harness scaffolded at generator `0.0.0`
// has unrelated drift against the current template (`LICENSE`,
// `.claude/skills/evolve/SKILL.md` removed, `package.json` changed), which a
// fresh scaffold at the same generator version reproduces. Asserting total
// drift would pin that unrelated asymmetry and fail for the wrong reason.
describe('SC5 — pre-removal harness gains no ICM tree on upgrade', () => {
  /** Copy the committed fixture manifest into a throwaway harness dir. */
  async function fixtureDir(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'cah-preremoval-'));
    await mkdir(join(root, '.harness'), { recursive: true });
    await cp(PREREMOVAL_FIXTURE, join(root, '.harness', 'manifest.json'));
    return root;
  }

  it('the fixture really is ICM-free (guards the guard)', async () => {
    const m = JSON.parse(await readFile(PREREMOVAL_FIXTURE, 'utf-8'));
    const paths = Object.keys(m.files ?? {});
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter(ICM_PATH), 'fixture must record no ICM paths').toEqual([]);
    // ...while the template it names IS ICM-capable — that is the whole tension.
    const capable = loadCatalog().find((t) => t.id === m.template);
    expect(capable?.icm?.enabled, `${m.template} must be capable`).toBe(true);
  });

  it('reports zero ICM files added or removed', async () => {
    const dir = await fixtureDir();
    const r = await upgradeCmd([dir]);
    expect(r.code).toBe(0);
    const text = r.lines.join('\n');
    const num = (label: string): number => {
      const m = text.match(new RegExp(`(\\d+) ${label}`));
      expect(m, `${label} line present`).not.toBeNull();
      return Number(m![1]);
    };

    // The baseline is computed *independently of the code path under test*:
    // re-render the template with ICM off (what a pre-removal harness should
    // get) and diff. A baseline obtained by running `upgradeCmd` on a fresh
    // scaffold would be worthless here — under the task-5.3 anti-pattern both
    // arms mutate the same way, so the comparison would agree and pass.
    const m = JSON.parse(await readFile(PREREMOVAL_FIXTURE, 'utf-8'));
    const nonIcm = await walkTemplate(
      templateDir(m.template), m.vars, { strict: false, icm: false },
    );
    const nonIcmFp: Record<string, string> = {};
    for (const [p, c] of Object.entries(asFileMap(nonIcm))) nonIcmFp[p] = sha256(c);
    const baseline = await planUpgrade(dir, nonIcmFp);

    expect(num('added')).toBe(baseline.added.length);
    expect(num('removed')).toBe(baseline.removed.length);
    expect(num('conflict')).toBe(0);
    // The independent baseline itself must be ICM-free — otherwise this test
    // would be measuring the wrong thing.
    expect(baseline.added.filter(ICM_PATH)).toEqual([]);
    expect(baseline.removed.filter(ICM_PATH)).toEqual([]);

    // And no ICM path is named anywhere in the plan.
    const capable = loadCatalog().find((t) => t.id === 'vertical:coding')!;
    for (const s of capable.icm?.stages ?? []) {
      expect(text, `${s.dir} must not be reported`).not.toContain(s.dir);
    }
    expect(text).not.toContain('references/CONTEXT.md');
  });

  it('holds because icmEnabled reads the manifest, not the catalog capability', async () => {
    // The measured counterfactual, which is what makes this test more than a
    // restatement of test 2. This harness *is* named `vertical:coding`, and
    // `resolveIcmDefault('vertical:coding')` is `true` — so a capability-derived
    // re-render would add the whole `.icm/` overlay. Measured: 10 files
    // (`CONTEXT.md`, `references/CONTEXT.md`, 4 stage `CONTEXT.md`, 4
    // `output/.gitkeep`), i.e. the "capable but no tree" state task 5.3
    // describes. `upgradeCmd` on the same harness adds 0 of them.
    const dir = await fixtureDir();
    const m = JSON.parse(await readFile(join(dir, '.harness', 'manifest.json'), 'utf-8'));
    expect(resolveIcmDefault(m.template), 'template is capable').toBe(true);

    // What a capability-driven render would produce for this manifest.
    const capable = await walkTemplate(
      templateDir(m.template), m.vars, { strict: false, icm: true },
    );
    const fingerprints: Record<string, string> = {};
    for (const [p, c] of Object.entries(asFileMap(capable))) fingerprints[p] = sha256(c);
    const counterfactual = await planUpgrade(dir, fingerprints);
    expect(counterfactual.added.filter(ICM_PATH).length, 'overlay size').toBe(10);

    // What the command actually reports: none of those 10.
    const actual = await upgradeCmd([dir]);
    const actualText = actual.lines.join('\n');
    for (const p of counterfactual.added.filter(ICM_PATH)) {
      expect(actualText, `${p} must not be added`).not.toContain(p);
    }
    // ...and the 10-file delta is the whole difference in the `added` count.
    const m2 = actualText.match(/(\d+) added/);
    expect(Number(m2![1])).toBe(counterfactual.added.length - 10);
  });
});
