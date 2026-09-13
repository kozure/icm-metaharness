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
import { join, relative, resolve } from 'node:path';
import { parseArgs, scaffold } from '../src/index.js';

const TEMPLATE = 'vertical:coding';
const TEMPLATES_ROOT = resolve(__dirname, '..', 'templates');
const OVERLAY_DIR = '.icm';

/** Every path the ICM payload contributes, relative to the scaffold root. */
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

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else out.push(relative(root, full));
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

describe('--icm argument contract', () => {
  it('parses explicit opt in and opt out without changing the default', () => {
    expect(parseArgs(['bot', '--icm']).icm).toBe(true);
    expect(parseArgs(['bot', '--no-icm']).icm).toBe(false);
    expect(parseArgs(['bot']).icm).toBeUndefined();
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
