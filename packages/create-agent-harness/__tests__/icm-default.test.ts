// SPDX-License-Identifier: MIT
//
// ADR-285 (superseding ADR-279 decision 2) — ICM follows the *template*, not a flag.
//
// This file is the named guard for the new default, and it covers the one thing
// the CI tour structurally cannot: **the flagless path**. `vertical-tour.mjs`'s
// ICM pass scaffolds with an explicit `icm: true` (it has to, in order to check
// each template's emitted tree against its catalog block), so every ICM
// assertion in CI used to exercise the *override*. The default — the entire
// point of this change — would otherwise be untested.
//
// Three properties, in the order they matter:
//
//   1.8  a capable template emits ICM with no flag to remember
//   1.9  a non-capable template is unchanged *in files and in stdout* — the
//        naive global flip leaked "Onboarding: interactive (0 questions)" here
//   1.10 the internal override still wins, in BOTH directions
//
// Property 1.10 is not tidiness. `minimal` is `generate: false` yet carries a
// 3-stage ICM tree, and four internal callers pass `icm: true` to reach it; an
// override-honouring-only-`true` bug would leave `minimal`'s tree unemittable by
// any path (ADR-285 §"Why the override survives").

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold, resolveIcmDefault } from '../src/index.js';

const BIN = join(__dirname, '..', 'dist', 'bin.js');

/** Both templates that carry ICM content (`.icm/` overlay + `icm.enabled`). */
const CAPABLE_GENERATED = 'vertical:coding'; // generate: true  -> default ON
const CAPABLE_HANDAUTHORED = 'minimal'; //      generate: false -> default OFF
const NON_CAPABLE = 'vertical:devops'; //       no icm block    -> default OFF

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

async function walkFiles(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkFiles(root, rel)));
    else out.push(rel);
  }
  return out.sort();
}

/** Scaffold WITHOUT an `icm` key at all — the true flagless path. */
async function scaffoldFlagless(template: string, suffix: string): Promise<string> {
  const target = join(await mkdtemp(join(tmpdir(), `icm-default-${suffix}-`)), 'demo-harness');
  await scaffold({
    name: 'demo-harness',
    template,
    host: 'claude-code',
    description: 'demo harness',
    targetDir: target,
    generatorVersion: 'test',
  });
  return target;
}

const hasIcmTree = (files: string[]): boolean => files.some(f => f === 'CONTEXT.md' && files.includes('stages/01-plan/CONTEXT.md'));

describe('ADR-285 1.1 — resolveIcmDefault is the capability predicate', () => {
  it('is true for the generated, ICM-carrying template and false for the hand-authored one', () => {
    // The two conjuncts, observed separately: both templates declare
    // `icm.enabled: true`, so `generate !== false` is what separates them.
    expect(resolveIcmDefault(CAPABLE_GENERATED)).toBe(true);
    expect(resolveIcmDefault(CAPABLE_HANDAUTHORED)).toBe(false);
  });

  it('is false for a template with no icm block, and fail-closed for an unknown id', () => {
    expect(resolveIcmDefault(NON_CAPABLE)).toBe(false);
    expect(resolveIcmDefault('vertical:does-not-exist')).toBe(false);
  });
});

describe('ADR-285 1.8 — a flagless capable scaffold emits the tree', () => {
  it('emits every ICM path with no flag to remember', async () => {
    const files = await walkFiles(await scaffoldFlagless(CAPABLE_GENERATED, 'capable'));
    for (const p of ICM_PATHS) expect(files).toContain(p);
  });

  it('records the ICM paths in the manifest, so upgrade treats them as managed', async () => {
    const target = await scaffoldFlagless(CAPABLE_GENERATED, 'capable-manifest');
    const manifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(target, '.harness', 'manifest.json'), 'utf-8'),
    );
    for (const p of ICM_PATHS) expect(Object.keys(manifest.files)).toContain(p);
  });
});

describe('ADR-285 1.9 — a flagless non-capable scaffold is unchanged, files AND stdout', () => {
  it('emits no ICM tree', async () => {
    const files = await walkFiles(await scaffoldFlagless(NON_CAPABLE, 'noncapable'));
    expect(hasIcmTree(files)).toBe(false);
    expect(files).not.toContain('stages/01-plan/CONTEXT.md');
  });

  it('runs no onboarding pass at all (the leak channel, at the level where it is live)', async () => {
    // Spec §3.3: a bare global flip made every one of the 18 non-capable
    // templates announce "Onboarding: interactive (0 questions)" — a workflow the
    // template has no ICM content to onboard. The `Onboarding:` *line* is printed
    // only when `result.onboarding` is set, so that field is the leak channel.
    //
    // Asserted through the LIBRARY, deliberately. Until task 2.4 removes the
    // CLI's `icm:` passthrough, the CLI supplies an explicit `false` on every
    // run, which masks the resolver entirely — a CLI-level assertion here would
    // pass for the wrong reason and could not fail on a broken resolver. The
    // library is where the capability default is actually observable today.
    const r = await scaffold({
      name: 'demo-harness',
      template: NON_CAPABLE,
      host: 'claude-code',
      description: 'demo harness',
      targetDir: join(await mkdtemp(join(tmpdir(), 'icm-default-gate-')), 'demo-harness'),
      generatorVersion: 'test',
    });
    expect(r.onboarding).toBeUndefined();
  });

  it('prints no `Onboarding:` line through the CLI — the user-visible surface', async () => {
    // The end-to-end form of the assertion above. Note this one cannot fail on a
    // broken *resolver* while the CLI still passes `icm:` explicitly (task 2.4);
    // it exists to guard the printed surface, and it starts gating the resolver
    // the moment 2.4 lands.
    const dir = await mkdtemp(join(tmpdir(), 'icm-default-stdout-'));
    const r = spawnSync(
      process.execPath,
      [BIN, 'demo-harness', '--template', NON_CAPABLE, '--force'],
      { cwd: dir, encoding: 'utf-8' },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/Onboarding:/);
  });
});

describe('ADR-285 1.10 — the internal override wins in BOTH directions', () => {
  it('icm: true emits `minimal`\'s hand-authored 3-stage tree (default would suppress it)', async () => {
    // Without this, `minimal`'s ICM tree is unemittable by any path: the
    // capability default resolves it to false (generate: false) and the four
    // internal callers would have nothing to reach.
    const target = join(await mkdtemp(join(tmpdir(), 'icm-default-minimal-')), 'demo-harness');
    await scaffold({
      name: 'demo-harness',
      template: CAPABLE_HANDAUTHORED,
      host: 'claude-code',
      description: 'demo harness',
      targetDir: target,
      generatorVersion: 'test',
      icm: true,
    });
    const files = await walkFiles(target);
    expect(files).toContain('CONTEXT.md');
    expect(files).toContain('stages/01-plan/CONTEXT.md');
    expect(files).toContain('stages/02-build/CONTEXT.md');
    expect(files).toContain('stages/03-verify/CONTEXT.md');
  });

  it('icm: false suppresses the tree on a capable template (default would emit it)', async () => {
    // The reverse direction. An override that only honoured `true` would pass
    // every other assertion in this file and silently be a one-way switch.
    const target = join(await mkdtemp(join(tmpdir(), 'icm-default-suppress-')), 'demo-harness');
    await scaffold({
      name: 'demo-harness',
      template: CAPABLE_GENERATED,
      host: 'claude-code',
      description: 'demo harness',
      targetDir: target,
      generatorVersion: 'test',
      icm: false,
    });
    const files = await walkFiles(target);
    expect(files).not.toContain('stages/01-plan/CONTEXT.md');
    expect(hasIcmTree(files)).toBe(false);
  });
});
