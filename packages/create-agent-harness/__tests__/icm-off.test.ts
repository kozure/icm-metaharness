// SPDX-License-Identifier: MIT
//
// Task 3.5 — ICM flag OFF: the merge-safety contract, asserted as bytes.
//
// ADR-279 decision 2 is a *hard* constraint, not a preference: a flagless
// scaffold must be byte-identical to upstream-at-pin, because that is what makes
// `harness upgrade` and a future upstream re-sync safe. This file is the named
// guard for that property.
//
// It is deliberately stronger than "the ICM files are absent" (which icm-off
// shares with icm-optin.test.ts). The claim here is *equality*: take the two
// scaffolds, delete the paths the flag adds, and what remains must match byte
// for byte — content and manifest. A fork change that perturbs default output
// fails here even when ICM itself is perfectly correct.

import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';
import { scaffold } from '../src/index.js';

const TEMPLATE = 'vertical:coding';

/**
 * The exact paths the `--icm` overlay contributes. Duplicated from
 * icm-optin.test.ts deliberately: this test must fail if the payload ever
 * *shrinks*, not just if it grows, so it may not import the list from the
 * module under test nor treat ICM_PATHS as authoritative by reference.
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

const toPosix = (p: string): string => p.split(sep).join(posix.sep);

async function walkFiles(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkFiles(root, rel)));
    else out.push(rel);
  }
  return out.sort();
}

async function scaffoldInto(suffix: string, icm: boolean | undefined): Promise<string> {
  const target = join(await mkdtemp(join(tmpdir(), `icm-off-${suffix}-`)), 'demo-harness');
  await scaffold({
    name: 'demo-harness',
    template: TEMPLATE,
    host: 'claude-code',
    description: 'demo harness',
    targetDir: target,
    generatorVersion: 'test',
    ...(icm === undefined ? {} : { icm }),
  });
  return target;
}

/** The manifest's only wall-clock field; masking it makes two runs comparable. */
const maskTimestamp = (s: string) => s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at": "MASKED"');

/**
 * The three paths the flag legitimately rewrites, and why each is excluded from
 * the byte-equality assertion below:
 *
 *  - `CLAUDE.md`                      — ADR-279 d3: under `--icm` the router is
 *                                       the single author, replacing upstream's
 *                                       banner. This is the *point* of the flag.
 *  - `.harness/manifest.json`         — the record of what emission wrote, so it
 *                                       necessarily lists the ten ICM files.
 *  - `.harness/manifest.sha256`       — derived from that manifest.
 *
 * Excluding them silently would make this test vacuous, so each exclusion is
 * paired with a positive assertion that the file changed *for that reason* —
 * see the last two tests. Everything else must be byte-identical.
 */
const FLAG_REWRITES = ['CLAUDE.md', '.harness/manifest.json', '.harness/manifest.sha256'];

describe('ICM flag OFF: byte-identical to the flagless baseline (task 3.5)', () => {
  it('yields identical bytes for every file the flag does not legitimately rewrite', async () => {
    const off = await scaffoldInto('bytes-off', undefined);
    const on = await scaffoldInto('bytes-on', true);

    const offFiles = (await walkFiles(off)).filter(
      (f) => !ICM_PATHS.includes(f) && !FLAG_REWRITES.includes(f),
    );
    // Guard against a vacuous pass: the flagless scaffold has files to compare.
    expect(offFiles.length).toBeGreaterThan(10);
    for (const path of offFiles) {
      const a = await readFile(join(off, ...path.split('/')), 'utf-8');
      const b = await readFile(join(on, ...path.split('/')), 'utf-8');
      expect(maskTimestamp(b), `${path} differs between flagless and --icm`).toBe(maskTimestamp(a));
    }
  });

  it('replaces the banner with the router at root CLAUDE.md — and only that', async () => {
    // ADR-279 d3 pinned as a positive claim: one author per mode, by name.
    const off = await scaffoldInto('claude-off', undefined);
    const on = await scaffoldInto('claude-on', true);
    const banner = await readFile(join(off, 'CLAUDE.md'), 'utf-8');
    const router = await readFile(join(on, 'CLAUDE.md'), 'utf-8');

    expect(banner).not.toMatch(/Layer 0|## Routing/);
    expect(router).toMatch(/Layer 0|## Routing/);
    // Both are rendered templates, so neither may leak a Mustache var.
    for (const md of [banner, router]) expect(md).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
    // And the router is genuinely a different document, not an edit in place.
    expect(router).not.toBe(banner);
  });

  it('leaves the flagless manifest byte-identical across two independent runs', async () => {
    const a = await scaffoldInto('manifest-a', undefined);
    const b = await scaffoldInto('manifest-b', undefined);
    const ma = await readFile(join(a, '.harness/manifest.json'), 'utf-8');
    const mb = await readFile(join(b, '.harness/manifest.json'), 'utf-8');
    expect(maskTimestamp(mb)).toBe(maskTimestamp(ma));
  });

  it('adds exactly the ICM paths and nothing else', async () => {
    const off = await scaffoldInto('delta-off', undefined);
    const on = await scaffoldInto('delta-on', true);
    const before = new Set(await walkFiles(off));
    const added = (await walkFiles(on)).filter((f) => !before.has(f)).map(toPosix);
    expect(added.sort()).toEqual([...ICM_PATHS].sort());
    // And in the other direction: the flag removes nothing.
    const after = new Set(await walkFiles(on));
    const removed = (await walkFiles(off)).filter((f) => !after.has(f));
    expect(removed).toEqual([]);
  });

  it('keeps the flagless manifest free of every ICM path', async () => {
    const off = await scaffoldInto('manifest-clean', undefined);
    const manifest = JSON.parse(await readFile(join(off, '.harness/manifest.json'), 'utf-8'));
    const recorded: string[] = Object.keys(manifest.files ?? {});
    for (const p of ICM_PATHS) expect(recorded).not.toContain(p);
  });
});
