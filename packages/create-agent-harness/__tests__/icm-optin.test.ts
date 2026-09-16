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

describe('ICM default follows the template capability (ADR-285)', () => {
  // INVERTED by task 3.8. The old claim — "a flagless scaffold emits no ICM file
  // at all" — is now false for a capable template: that is precisely what the
  // default promotion means. The surviving claim is *capability*, asserted in
  // both directions so neither half can pass vacuously.
  it('emits the tree flagless on a capable template', async () => {
    const { target } = await scaffoldInto('capable-flagless', undefined);
    const files = await walkFiles(target);
    for (const p of ICM_PATHS) expect(files, `missing ${p}`).toContain(p);
  });

  it('emits no ICM file on a non-capable template', async () => {
    // The companion half the inversion requires: capability, not a flag, decides.
    const target = join(await mkdtemp(join(tmpdir(), 'icm-noncap-')), 'demo-harness');
    await scaffold({
      name: 'demo-harness',
      template: 'vertical:devops',
      host: 'claude-code',
      description: 'demo harness',
      targetDir: target,
      generatorVersion: 'test',
    });
    const files = await walkFiles(target);
    for (const p of ICM_PATHS) expect(files).not.toContain(p);
    expect(files.filter((f) => f.startsWith('stages/'))).toEqual([]);
    expect(files.filter((f) => f.startsWith('references/'))).toEqual([]);
  });

  it('gives a capable flagless scaffold the router, not the banner', async () => {
    // Re-scoped with 3.3: post-removal a capable scaffold is *always* the router,
    // so the banner case moved to non-capable templates (guarded in icm-off).
    const { target } = await scaffoldInto('capable-router', undefined);
    const md = await readFile(join(target, 'CLAUDE.md'), 'utf-8');
    for (const marker of ROUTER_MARKERS) expect(md).toContain(marker);
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
  // PREMISE-DIES SITE #8 — not in spec §5's table (the table names seven). This
  // `describe`'s delta test built its "off" baseline from `icm: undefined`, which
  // after the flip resolves to `true` on a capable template — so both sides became
  // ICM scaffolds and `added` came out `[]`. It failed loudly rather than passing
  // vacuously (the assertion is an equality against ICM_PATHS), which is why the
  // sweep caught it; a silently-vacuous variant would not have. Re-pointed onto
  // the surviving override baseline (`icm: false`), matching icm-off.test.ts.
  it('emits every ICM path', async () => {
    const { target } = await scaffoldInto('on', true);
    const files = await walkFiles(target);
    for (const p of ICM_PATHS) expect(files, `missing ${p}`).toContain(p);
  });

  it('adds the ICM payload and nothing else', async () => {
    const off = await scaffoldInto('delta-off', false);
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
   * with the SAME overlay state scaffold emitted — otherwise a harness's ten ICM
   * files appear only in the old manifest and are reported as `removed` drift,
   * and `upgrade --apply` would delete the whole ICM tree.
   *
   * This drives the real subcommand rather than re-deriving the overlay decision
   * in the test: the assertion is on the plan `upgradeCmd` actually produces.
   *
   * RE-SCOPED by task 3.9. The old pair was "with `--icm` vs without `--icm`" —
   * but after the flag removal *both* capable scaffolds emit the tree, so that
   * pair has collapsed into one case and no longer distinguishes anything. The
   * pair that still exists is **pre-removal flagless vs post-removal flagless**:
   * a harness scaffolded when ICM was still opt-in (no ICM in its manifest) and
   * one scaffolded under the new default (ICM recorded). Both must upgrade with
   * no ICM drift — the first must NOT retro-add the tree (that is task 5.3's
   * "upgrade retro-add" risk), the second must not delete it.
   */
  const removedCount = async (target: string) => {
    const r = await upgradeCmd([target]);
    const m = r.lines.join('\n').match(/^\s*(\d+) removed$/m);
    expect(m, `no removed count in: ${r.lines.join(' | ')}`).toBeTruthy();
    return Number(m![1]);
  };

  it('reports no ICM drift for a post-removal harness (tree recorded, tree preserved)', async () => {
    // Post-removal flagless capable: the new default, manifest carries the tree.
    const post = await scaffoldInto('up-post', undefined);
    const filesBefore = await walkFiles(post.target);
    for (const p of ICM_PATHS) expect(filesBefore, `missing ${p}`).toContain(p);

    const removed = await removedCount(post.target);
    // None of the ten ICM paths are reported as drift.
    expect(removed).toBeLessThan(ICM_PATHS.length);
  });

  it('reports no ICM drift for a pre-removal flagless harness, and does not retro-add', async () => {
    // `icm: false` reproduces exactly what the old *flagless* capable scaffold
    // produced: a capable template, no ICM in the manifest. This stands in for a
    // harness created before the default flip.
    const pre = await scaffoldInto('up-pre', false);
    const filesBefore = await walkFiles(pre.target);
    for (const p of ICM_PATHS) expect(filesBefore).not.toContain(p);

    const removed = await removedCount(pre.target);
    expect(removed).toBeLessThan(ICM_PATHS.length);

    // The critical half: upgrade must NOT add the tree to a harness that never
    // had it. `icmEnabled` reads the *manifest* (what was emitted), not the
    // catalog (what the template could emit) — if that ever became capability-
    // based, this asserts the tree would appear and the test would go red.
    const filesAfter = await walkFiles(pre.target);
    for (const p of ICM_PATHS) expect(filesAfter, `retro-added ${p}`).not.toContain(p);
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
   *
   * ── F1 GUARD (task 3.10) ────────────────────────────────────────────────────
   * Assertions below are left substantively intact *deliberately*, and the
   * `icm: true` argument is what makes them an F1 guard rather than a leftover:
   *
   * `minimal` is the ONLY template that both carries an ICM payload and is
   * ICM-free *by default* (`icm.enabled === true`, `generate: false`). Because
   * `resolveIcmDefault()` requires `generate !== false`, a bare capability
   * default would make this tree unemittable by ANY path — that is audit R1.
   * These tests pass only because an explicit `icm: true` still overrides the
   * resolver. If a future change lets the capability default override an explicit
   * `icm: true`, this block goes red — which is the whole point of keeping it.
   *
   * Falsified in task 3.14(c) (mutation: override dropped).
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

describe('ICM override survives in the negative direction (task 3.10b, SC11)', () => {
  /**
   * The reverse-override case. The `minimal` block above covers `icm: true` on a
   * template whose default is off; this covers `icm: false` on a template whose
   * default is *on*. Without it, an override-dropping regression that only
   * respected `true` would pass every other test in this suite — the resolver
   * would be consulted in both directions and the explicit `false` ignored.
   *
   * Together the pair is the proof that §6.1's override is honoured *in both
   * directions*, not just as an opt-in. Falsified in task 3.14(c).
   */
  it('emits no ICM tree when a capable template is given an explicit icm: false', async () => {
    const off = await scaffoldInto('neg-override', false);
    const files = await walkFiles(off.target);
    for (const p of ICM_PATHS) expect(files, `unexpected ${p}`).not.toContain(p);
    expect(files.filter((f) => f.startsWith('stages/'))).toEqual([]);
    // Still a full scaffold — the override suppresses ICM, not the harness.
    expect(files.length).toBeGreaterThan(10);
  });
});
