// SPDX-License-Identifier: MIT
//
// Merge-safety contract for the ICM opt-in (ADR-279 decisions 2 and 3).
//
// Decision 2 is a *hard* constraint: a flagless scaffold must be byte-identical
// to upstream-at-pin, because that is what makes `harness upgrade` and upstream
// merges safe. Decision 3 requires exactly one author of root `CLAUDE.md`.
//
// This file exists because the first cut of the ICM work violated both: the
// payload landed as plain files inside `templates/vertical_coding/`, and since
// walkTemplate() recurses the whole template dir it emitted them
// UNCONDITIONALLY — a flagless `scaffold('vertical:coding')` produced 31 files
// instead of 21, and a router `CLAUDE.md` instead of upstream's banner. The
// tests below pin the property that failed, and the last block pins the *root
// cause* (ICM content parked in the template dir) so it cannot return silently.

import { describe, it, expect } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve, sep } from 'node:path';
import { parseArgs, scaffold } from '../src/index.js';
import { upgradeCmd } from '../src/upgrade-cmd.js';
import { runIcmStructure } from '../src/validate.js';

const TEMPLATE = 'vertical:coding';
const TEMPLATES_ROOT = resolve(__dirname, '..', 'templates');
const OVERLAY_DIR = '.icm';

/**
 * Every path the ICM payload contributes, relative to the scaffold root.
 * Posix-shaped: paths are normalised by `walkFiles` before comparison, so a
 * Windows run compares against the same literals. (ci.yml's own header states
 * this rule: "File paths in test fixtures MUST be normalised via path.join +
 * posix" — the walker's manifest keys are normalised the same way, which is why
 * an earlier version of this suite passed on Linux and Windows alike while
 * comparing native separators against these literals: every file-set assertion
 * failed loudly on Windows *except the manifest one*, which passed.
 * Non-vacuous guards: `startsWith('stages/')` and the root-cause
 * `startsWith(\`${OVERLAY_DIR}/\`)` both silently matched nothing with native
 * separators, so they asserted a tautology there.)
 */
const ICM_PATHS = [
  'CONTEXT.md',
  'references/CONTEXT.md',
  'stages/01-plan/CONTEXT.md',
  'stages/01-plan/output/.gitkeep',
  'stages/02-implement/CONTEXT.md',
  'stages/02-implement/output/.gitkeep',
  'stages/03-test/CONTEXT.md',
  'stages/03-test/output/.gitkeep',
  'stages/04-review/CONTEXT.md',
  'stages/04-review/output/.gitkeep',
];

/** Markers that appear in the ICM router and never in upstream's banner. */
const ROUTER_MARKERS = ['## Folder Map', '## Routing', 'Layer 0'];
const SCREAMING_SNAKE = /\{\{[A-Z][A-Z0-9_]*\}\}/g;

/** Normalise OS-specific separators to posix, as the walker does for manifest keys. */
const toPosix = (p: string): string => p.split(sep).join(posix.sep);

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else out.push(toPosix(relative(root, full)));
    }
  };
  await visit(root);
  return out.sort();
}

async function scaffoldInto(suffix: string, icm: boolean | undefined) {
  const target = join(await mkdtemp(join(tmpdir(), `icm-${suffix}-`)), 'demo-harness');
  const result = await scaffold({
    name: 'demo-harness',
    template: TEMPLATE,
    host: 'claude-code',
    description: 'demo harness',
    targetDir: target,
    generatorVersion: 'test',
    ...(icm === undefined ? {} : { icm }),
  });
  return { target, result };
}

describe('--icm flags are gone; the parser silently ignores them (ADR-285, SC3)', () => {
  it('no longer records an icm opt-in or opt-out from the command line', () => {
    // Task 3.7 (discharged here, at 2.1, because deleting the parser branches
    // is what falsifies the old assertions — a test may not outlive the surface
    // it asserts on). The accepted contract is *silent ignore*, not rejection:
    // parseArgs has never had an unknown-flag rule and adding one was declined.
    expect(parseArgs(['bot', '--icm']).icm).toBeUndefined();
    expect(parseArgs(['bot', '--no-icm']).icm).toBeUndefined();
    expect(parseArgs(['bot']).icm).toBeUndefined();
  });

  it('does not let --answers imply ICM-ness any more', () => {
    // Task 2.2: answers supply *content*; the template supplies ICM-ness.
    const parsed = parseArgs(['bot', '--answers', '/tmp/answers.json']);
    expect(parsed.answers).toBe('/tmp/answers.json');
    expect(parsed.icm).toBeUndefined();
  });
});

describe('ICM opt-in: default OFF is byte-identical to upstream', () => {
  it('emits no ICM file at all when the flag is absent', async () => {
    const { target } = await scaffoldInto('off', undefined);
    const files = await walkFiles(target);
    for (const p of ICM_PATHS) expect(files).not.toContain(p);
    expect(files.filter((f) => f.startsWith('stages/'))).toEqual([]);
    expect(files.filter((f) => f.startsWith('references/'))).toEqual([]);
  });

  it('emits the template banner, not the router, for root CLAUDE.md', async () => {
    const { target } = await scaffoldInto('off-banner', undefined);
    const md = await readFile(join(target, 'CLAUDE.md'), 'utf-8');
    for (const marker of ROUTER_MARKERS) expect(md).not.toContain(marker);
  });

  it('reports no unresolved placeholders', async () => {
    const { result } = await scaffoldInto('off-unresolved', undefined);
    expect(result.unresolved).toEqual([]);
  });

  it('writes a harness manifest whose content is timestamp-independent', async () => {
    // The manifest's only wall-clock field is `generated_at`; masking it must
    // make two independent runs byte-identical. This is the content half of the
    // byte-identity guarantee (the file-set half is asserted above), and it is
    // what makes a no-flag scaffold safe to diff against upstream.
    const a = await scaffoldInto('off-manifest-a', undefined);
    const b = await scaffoldInto('off-manifest-b', undefined);
    const mask = (s: string) => s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at": "MASKED"');
    expect(mask(await readFile(join(a.target, '.harness/manifest.json'), 'utf-8'))).toBe(
      mask(await readFile(join(b.target, '.harness/manifest.json'), 'utf-8')),
    );
  });
});

describe('ICM opt-in: --icm adds exactly the payload', () => {
  it('emits every ICM path', async () => {
    const { target } = await scaffoldInto('on', true);
    const files = await walkFiles(target);
    for (const p of ICM_PATHS) expect(files, `missing ${p}`).toContain(p);
  });

  it('adds the ICM payload and nothing else', async () => {
    const off = await scaffoldInto('delta-off', undefined);
    const on = await scaffoldInto('delta-on', true);
    const before = new Set(await walkFiles(off.target));
    const added = (await walkFiles(on.target)).filter((f) => !before.has(f));
    expect(added.sort()).toEqual([...ICM_PATHS].sort());
  });

  it('roots the router at CLAUDE.md and renders harness vars into it', async () => {
    const { target, result } = await scaffoldInto('on-router', true);
    const md = await readFile(join(target, 'CLAUDE.md'), 'utf-8');
    for (const marker of ROUTER_MARKERS) expect(md).toContain(marker);
    expect(md).toContain('demo-harness');
    expect(md).toContain('demo harness');
    // The router is a rendered .tmpl: no placeholder may survive in it.
    expect(md.match(SCREAMING_SNAKE)).toBeNull();
    expect(result.unresolved).toEqual([]);
  });

  it('leaves stage contracts as plain copies so onboarding placeholders survive', async () => {
    const { target } = await scaffoldInto('on-stage', true);
    const stage = await readFile(join(target, 'stages/01-plan/CONTEXT.md'), 'utf-8');
    expect(stage.match(SCREAMING_SNAKE)?.length ?? 0).toBeGreaterThan(0);
  });

  it('records the ICM paths in the harness manifest so upgrade treats them as managed', async () => {
    const { target } = await scaffoldInto('on-manifest', true);
    const manifest = JSON.parse(await readFile(join(target, '.harness/manifest.json'), 'utf-8'));
    const recorded = Object.keys(manifest.files ?? {});
    for (const p of ICM_PATHS) expect(recorded, `manifest missing ${p}`).toContain(p);
  });
});

describe('ICM root cause: the payload lives only in the gated overlay', () => {
  it('keeps the template dir free of ICM content outside .icm/', async () => {
    const dir = join(TEMPLATES_ROOT, 'vertical_coding');
    const files = await walkFiles(dir);
    const loose = files.filter((f) => f !== OVERLAY_DIR && !f.startsWith(`${OVERLAY_DIR}/`));
    // walkTemplate() emits everything it finds in the template dir, so any ICM
    // file parked here leaks into a flagless scaffold. That is precisely the
    // defect this suite guards; assert the template root stays upstream-shaped.
    expect(loose.filter((f) => f === 'CONTEXT.md' || f.startsWith('stages/'))).toEqual([]);
    expect(loose.filter((f) => f.startsWith('references/'))).toEqual([]);
    expect(await stat(join(dir, OVERLAY_DIR)).then((s) => s.isDirectory())).toBe(true);
  });
});

describe('ICM upgrade round trip: ICM files are managed, not drift', () => {
  /**
   * `harness upgrade` re-renders the template to compute the expected file map,
   * then diffs it against the manifest's recorded fingerprints. It must re-render
   * with the SAME overlay scaffold emitted — otherwise an `--icm` scaffold's ten
   * ICM files appear only in the old manifest and are reported as `removed`
   * drift, and `upgrade --apply` would delete the whole ICM tree.
   *
   * This drives the real subcommand rather than re-deriving the overlay decision
   * in the test: the assertion is on the plan `upgradeCmd` actually produces, so
   * dropping the overlay from the upgrade re-render fails here (12 removed vs 2).
   */
  it('reports the identical upgrade plan with and without --icm', async () => {
    const off = await scaffoldInto('up-off', undefined);
    const on = await scaffoldInto('up-on', true);
    const removedCount = async (target: string) => {
      const r = await upgradeCmd([target]);
      const m = r.lines.join('\n').match(/^\s*(\d+) removed$/m);
      expect(m, `no removed count in: ${r.lines.join(' | ')}`).toBeTruthy();
      return Number(m![1]);
    };
    const offRemoved = await removedCount(off.target);
    const onRemoved = await removedCount(on.target);
    // The overlay adds no drift the flagless scaffold does not already have.
    expect(onRemoved).toBe(offRemoved);
    // And specifically: none of the ten ICM paths are reported as drift.
    expect(onRemoved).toBeLessThan(ICM_PATHS.length);
  });
});

describe('ICM on a generate:false template (task 2.6)', () => {
  /**
   * `minimal` is `generate:false` — upstream hand-maintains its dir, so the
   * builder must not run for it. Its ICM overlay must still be emitted, from the
   * same `icmContentFor()` source, because `catalog.json` advertises the stages
   * the `icm-structure` check validates against. Hand-copying that content
   * (task 2.6's literal instruction) would be the second encoding the
   * single-source design forbids, and would let the catalog and the emitted tree
   * silently disagree.
   */
  const MINIMAL_PATHS = [
    'CONTEXT.md',
    'references/CONTEXT.md',
    'stages/01-plan/CONTEXT.md',
    'stages/01-plan/output/.gitkeep',
    'stages/02-build/CONTEXT.md',
    'stages/02-build/output/.gitkeep',
    'stages/03-verify/CONTEXT.md',
    'stages/03-verify/output/.gitkeep',
  ];

  const scaffoldMinimal = async (suffix: string, icm: boolean) => {
    const target = join(await mkdtemp(join(tmpdir(), `icm-min-${suffix}-`)), 'demo-harness');
    await scaffold({
      name: 'demo-harness',
      template: 'minimal',
      host: 'claude-code',
      description: 'demo harness',
      targetDir: target,
      generatorVersion: 'test',
      icm,
    });
    return target;
  };

  it('emits the catalog stages under --icm, and nothing under a flagless run', async () => {
    const on = await scaffoldMinimal('on', true);
    expect(await walkFiles(on)).toEqual(expect.arrayContaining(MINIMAL_PATHS));

    const off = await scaffoldMinimal('off', false);
    const offFiles = await walkFiles(off);
    for (const p of MINIMAL_PATHS) expect(offFiles).not.toContain(p);
  });

  it('passes the icm-structure check against the catalog stage list', async () => {
    const on = await scaffoldMinimal('on-validate', true);
    const r = await runIcmStructure(on);
    expect(r.tag).toBe('PASS');
    expect(r.detail).toMatch(/3 stages/);
  });
});
