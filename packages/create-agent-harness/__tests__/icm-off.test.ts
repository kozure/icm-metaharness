// SPDX-License-Identifier: MIT
//
// Task 3.5 (repurposed by 3.2–3.6) — the merge-safety contract, asserted as bytes.
//
// CONTRACT CHANGE (ADR-285): *byte-equality retired, capability-preservation
// substituted.*
//
// This file used to guard ADR-279 decision 2 as a *hard* constraint: a flagless
// scaffold had to be byte-identical to upstream-at-pin, because that is what made
// `harness upgrade` and an upstream re-sync safe. That property is gone by
// design — a capable template now emits its ICM tree with no flag, so a flagless
// render is deliberately NOT identical to upstream. The file therefore no longer
// claims "nothing changed". It claims what is still true:
//
//   * the ICM overlay contributes *exactly* the tree and *nothing else* — no
//     upstream file is perturbed except the three the overlay owns by design;
//   * the default a template gets is decided by *capability*, and non-capable
//     templates are untouched by the whole mechanism;
//   * `CLAUDE.md` still has exactly one author per mode (ADR-279 d3 survives).
//
// ── Falsification of the literal re-point prescribed by task 3.2 / 3.5 ───────
//
// Both tasks instructed re-pointing the delta onto a *capable vs non-capable*
// comparison (`vertical:coding` vs `vertical:devops`). Measured live, that is
// impossible to assert and was NOT implemented as written:
//
//   - `coding` flagless = 31 files, `devops` flagless = 19; only 14 names are
//     common, and 8 of those 14 differ in *content* (`.claude/settings.json`,
//     `.claude-plugin/plugin.json`, …). They are different templates; sharing a
//     path does not make two files equal.
//   - "capable minus non-capable == ICM_PATHS" is false: `coding`-only names =
//     17, `ICM_PATHS` = 10.
//   - Scanning all 20 templates, only `minimal`'s flagless output is a *subset*
//     of coding's; every other non-capable template contributes 3–7 files of its
//     own.
//
// So a cross-template byte/file-set delta cannot isolate the ICM contribution.
// The measurement that *does* isolate it is toggling the surviving override on a
// single capable template (`icm: false` vs `icm: true`) — which is exactly what
// the old flag used to do, now expressed through the library seam. The
// *capability* claim is guarded separately, and correctly, by name-set presence:
// capable flagless emits the tree, non-capable flagless does not.

import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';
import { scaffold } from '../src/index.js';

const CAPABLE = 'vertical:coding';
/** A non-capable template, used only for the *presence* claims (never for bytes). */
const NON_CAPABLE = 'vertical:devops';

/**
 * The exact paths the ICM overlay contributes. Duplicated from
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

async function scaffoldInto(
  suffix: string,
  icm: boolean | undefined,
  template: string = CAPABLE,
): Promise<string> {
  const target = join(await mkdtemp(join(tmpdir(), `icm-off-${suffix}-`)), 'demo-harness');
  await scaffold({
    name: 'demo-harness',
    template,
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
 * The three paths the ICM overlay legitimately rewrites, and why each is excluded
 * from the byte-equality assertion below:
 *
 *  - `CLAUDE.md`                      — ADR-279 d3: with ICM the router is the
 *                                       single author, replacing upstream's
 *                                       banner. This is the *point* of the
 *                                       overlay, not a leak.
 *  - `.harness/manifest.json`         — the record of what emission wrote, so it
 *                                       necessarily lists the ten ICM files.
 *  - `.harness/manifest.sha256`       — derived from that manifest.
 *
 * Excluding them silently would make this test vacuous, so each exclusion is
 * paired with a positive assertion that the file changed *for that reason* —
 * see the router test and the delta test. Everything else must be byte-identical.
 */
const OVERLAY_REWRITES = ['CLAUDE.md', '.harness/manifest.json', '.harness/manifest.sha256'];

describe('ICM overlay: contributes the tree and perturbs nothing else (task 3.5)', () => {
  it('yields identical bytes for every file the overlay does not legitimately rewrite', async () => {
    // Same template, override toggled: isolates the ICM contribution exactly.
    // (A cross-template comparison cannot do this — see the header.)
    const off = await scaffoldInto('bytes-off', false);
    const on = await scaffoldInto('bytes-on', true);

    const offFiles = (await walkFiles(off)).filter(
      (f) => !ICM_PATHS.includes(f) && !OVERLAY_REWRITES.includes(f),
    );
    // Guard against a vacuous pass: the non-ICM scaffold has files to compare.
    expect(offFiles.length).toBeGreaterThan(10);
    for (const path of offFiles) {
      const a = await readFile(join(off, ...path.split('/')), 'utf-8');
      const b = await readFile(join(on, ...path.split('/')), 'utf-8');
      expect(maskTimestamp(b), `${path} differs between icm:false and icm:true`).toBe(
        maskTimestamp(a),
      );
    }
  });

  it('gives root CLAUDE.md exactly one author per mode (ADR-279 d3 survives)', async () => {
    // Re-scoped by 3.3. Post-removal a *capable* scaffold is always the router,
    // with or without the override, so the banner case no longer exists on a
    // capable template — it belongs to non-capable ones. Assert both halves by
    // name, on the flagless path (the default a user actually gets).
    const capable = await scaffoldInto('router-capable', undefined, CAPABLE);
    const nonCapable = await scaffoldInto('banner-noncapable', undefined, NON_CAPABLE);
    const router = await readFile(join(capable, 'CLAUDE.md'), 'utf-8');
    const banner = await readFile(join(nonCapable, 'CLAUDE.md'), 'utf-8');

    expect(router).toMatch(/Layer 0|## Routing/);
    expect(banner).not.toMatch(/Layer 0|## Routing/);
    // Both are rendered templates, so neither may leak a Mustache var.
    for (const md of [banner, router]) expect(md).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
    // And the router is genuinely a different document, not an edit in place.
    expect(router).not.toBe(banner);
  });

  it('leaves a capable flagless manifest byte-identical across two independent runs', async () => {
    // Retargeted by 3.4 to a capable flagless pair, so it still proves the *new
    // default* is stable (not just the old opt-in path).
    const a = await scaffoldInto('manifest-a', undefined, CAPABLE);
    const b = await scaffoldInto('manifest-b', undefined, CAPABLE);
    const ma = await readFile(join(a, '.harness/manifest.json'), 'utf-8');
    const mb = await readFile(join(b, '.harness/manifest.json'), 'utf-8');
    expect(maskTimestamp(mb)).toBe(maskTimestamp(ma));
  });

  it('adds exactly the ICM paths and nothing else', async () => {
    // Re-pointed by 3.5 to the surviving delta. The task prescribed a
    // *capability* delta (capable minus non-capable), which is falsified —
    // templates differ in base content (17 coding-only names ≠ 10 ICM paths).
    // The override delta on one template isolates the ICM contribution exactly.
    const off = await scaffoldInto('delta-off', false);
    const on = await scaffoldInto('delta-on', true);
    const before = new Set(await walkFiles(off));
    const added = (await walkFiles(on)).filter((f) => !before.has(f)).map(toPosix);
    expect(added.sort()).toEqual([...ICM_PATHS].sort());
    // And in the other direction: the overlay removes nothing.
    const after = new Set(await walkFiles(on));
    const removed = (await walkFiles(off)).filter((f) => !after.has(f));
    expect(removed).toEqual([]);
  });

  it('keeps a non-capable manifest free of every ICM path, and a capable one records them', async () => {
    // Retargeted by 3.6: "flagless manifest is free of ICM paths" is now FALSE
    // for a capable template (that is the new default), so the absence claim
    // moves to a non-capable template — paired with the inverse, so neither half
    // can pass vacuously.
    const nonCapable = await scaffoldInto('manifest-noncapable', undefined, NON_CAPABLE);
    const ncManifest = JSON.parse(
      await readFile(join(nonCapable, '.harness/manifest.json'), 'utf-8'),
    );
    const ncRecorded: string[] = Object.keys(ncManifest.files ?? {});
    for (const p of ICM_PATHS) expect(ncRecorded).not.toContain(p);

    const capable = await scaffoldInto('manifest-capable', undefined, CAPABLE);
    const capManifest = JSON.parse(
      await readFile(join(capable, '.harness/manifest.json'), 'utf-8'),
    );
    const capRecorded: string[] = Object.keys(capManifest.files ?? {});
    for (const p of ICM_PATHS) expect(capRecorded).toContain(p);
  });
});
