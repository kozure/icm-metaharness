// SPDX-License-Identifier: MIT
//
// Task 3.6 — the emitted stage set equals the catalog's, exactly.
//
// ADR-279 Deviation B single-sources the ICM payload as data in
// `catalog.def.mjs` -> `catalog.json`'s `icm.stages`. The reason is
// `gen-templates.mjs` emits from that data, so the emitted tree and the
// advertised list cannot disagree. This file is the regression guard for that
// design: it compares the *emitted* tree against the *catalog* at runtime,
// rather than against a literal list, so a stage added to the catalog but not
// emitted (or vice versa) fails here.
//
// It covers every template carrying an `icm` block, not just the reference
// `vertical:coding` — including `minimal`, which is `generate:false` and
// therefore the one template the builder does not emit (ADR-279's recorded
// exception: that overlay is emitted by `emitIcmOverlay()` directly).

import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, sep } from 'node:path';
import { scaffold, loadCatalog } from '../src/index.js';

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

/** Stage dirs are the `dir` rows under `stages/`; row 0 is Layer 3 navigation. */
const stageDirsOf = (icm: { stages?: Array<{ dir: string }> }) =>
  (icm.stages ?? []).map((s) => s.dir).filter((d) => d.startsWith('stages/'));

const icmTemplates = loadCatalog().filter((t) => t.icm);

describe('emitted stage set == catalog.icm.stages (task 3.6)', () => {
  it('covers every catalog template that advertises an icm block', () => {
    expect(icmTemplates.map((t) => t.id).sort()).toEqual(['minimal', 'vertical:coding']);
  });

  for (const t of loadCatalog().filter((t) => t.icm)) {
    it(`${t.id}: emits exactly the catalog stage dirs, in order`, async () => {
      const target = join(await mkdtemp(join(tmpdir(), `icm-scaffold-${t.id.replace(/[^a-z]/gi, '')}-`)), 'demo-harness');
      await scaffold({
        name: 'demo-harness',
        template: t.id,
        host: 'claude-code',
        description: 'demo harness',
        targetDir: target,
        generatorVersion: 'test',
        icm: true,
      });

      const files = (await walkFiles(target)).map(toPosix);
      const emitted = [
        ...new Set(
          files
            .filter((f) => f.startsWith('stages/'))
            .map((f) => f.split('/').slice(0, 2).join('/')),
        ),
      ].sort();

      // Equality in both directions: no missing stage, no extra stage.
      expect(emitted).toEqual(stageDirsOf(t.icm!));

      // Each stage carries a contract and an output/ dir marker.
      for (const d of stageDirsOf(t.icm!)) {
        expect(files, `missing ${d}/CONTEXT.md`).toContain(`${d}/CONTEXT.md`);
        expect(files, `missing ${d}/output/.gitkeep`).toContain(`${d}/output/.gitkeep`);
      }

      // Root layers present; no per-stage references/ (the amended Unit 2 FR).
      expect(files).toContain('CONTEXT.md');
      expect(files).toContain('references/CONTEXT.md');
      for (const d of stageDirsOf(t.icm!)) {
        expect(files.some((f) => f.startsWith(`${d}/references/`))).toBe(false);
      }

      // The router is rendered; stage contracts keep their onboarding placeholders.
      const router = await readFile(join(target, 'CLAUDE.md'), 'utf-8');
      expect(router).toMatch(/Layer 0|## Routing/);
      expect(router).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
      const stage = await readFile(join(target, ...stageDirsOf(t.icm!)[0].split('/'), 'CONTEXT.md'), 'utf-8');
      expect(stage).toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
    });
  }
});
