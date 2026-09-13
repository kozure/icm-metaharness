// SPDX-License-Identifier: MIT
//
// Recursive template walker. Walks a templates/<id>/ directory, renders
// every .tmpl file through the Mustache engine, and emits a flat
// path -> content map keyed by the destination paths.
//
// Convention (per templates/minimal/manifest.json files[].src/dst):
//   - <file>.tmpl  -> render through Mustache, drop the .tmpl suffix
//   - <file>      -> copy verbatim (binary-safe via Uint8Array)
//
// The walker does NOT touch the filesystem of the destination — it returns
// an in-memory map. The CLI commits to disk in a single batch so failures
// can roll back atomically (ADR-008 §atomic-generation).

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep, posix } from 'node:path';
import { render, type TemplateVars } from './renderer.js';

export interface RenderedFile {
  /** Posix-style relative path inside the destination directory. */
  path: string;
  /** Final UTF-8 content. */
  content: string;
  /** Did this file go through the Mustache renderer? */
  rendered: boolean;
  /** Variables that were referenced but had no value. Empty = clean render. */
  unresolved: string[];
}

/** Normalise OS-specific separators to posix for stable manifest keys. */
function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

/**
 * The ICM overlay subtree, relative to a template dir. Files below it are
 * emitted ONLY when the caller opts in (`opts.icm`), and their emitted path is
 * the path *inside* the subtree — `.icm/stages/01-plan/CONTEXT.md` becomes
 * `stages/01-plan/CONTEXT.md`.
 *
 * Why an overlay subtree and not plain files in the template dir: the walker
 * recurses the whole dir, so any file parked there is emitted unconditionally.
 * That is exactly how the first cut of the ICM work leaked `CONTEXT.md`,
 * `stages/`, `references/` and a router `CLAUDE.md` into a *no-flag* scaffold —
 * breaking the merge-safety guarantee the fork is built around (ADR-279
 * decision 2), which requires a flagless render to be byte-identical to
 * upstream. Gating on a reserved subtree keeps the ICM payload inside the
 * walked root (so it rides the existing emission path, `.harness/manifest.json`
 * coverage and drift detection — spec FR "all ICM files shall be emitted
 * through template manifest rows only; no post-walk emitter shall be added")
 * while keeping it invisible to a flagless walk.
 */
const ICM_OVERLAY_DIR = '.icm';

/**
 * Walk a template directory and return one RenderedFile per file found.
 * Throws on any file with unresolved vars when `strict` is true.
 *
 * `icm: true` includes the `.icm/` overlay subtree (with the prefix stripped);
 * the default, and every non-ICM caller, is unaffected.
 */
export async function walkTemplate(
  templateDir: string,
  vars: TemplateVars,
  opts: { strict?: boolean; icm?: boolean } = {},
): Promise<RenderedFile[]> {
  const out: RenderedFile[] = [];
  await walk(templateDir, templateDir, vars, out, { icm: opts.icm === true });
  if (opts.icm) {
    // Overlay paths arrive with the reserved prefix; emit them at the root of
    // the scaffold instead (`.icm/CLAUDE.md` -> `CLAUDE.md`). The overlay also
    // *wins* any path collision with the template's own files: this is the
    // single-authorship rule for root `CLAUDE.md` (ADR-279 decision 3) applied
    // at the one place where both variants are visible at once. The template
    // root keeps upstream's `CLAUDE.md.tmpl` untouched so a flagless walk is
    // byte-identical; the ICM router lives only in the overlay.
    const overlay: RenderedFile[] = [];
    const base: RenderedFile[] = [];
    for (const f of out) {
      if (f.path === ICM_OVERLAY_DIR || f.path.startsWith(`${ICM_OVERLAY_DIR}/`)) {
        f.path = f.path.slice(ICM_OVERLAY_DIR.length).replace(/^\//, '');
        overlay.push(f);
      } else {
        base.push(f);
      }
    }
    const overlayPaths = new Set(overlay.map((f) => f.path));
    const merged = base.filter((f) => !overlayPaths.has(f.path));
    merged.push(...overlay);
    out.length = 0;
    out.push(...merged);
  }
  if (opts.strict) {
    const offenders = out.filter(f => f.unresolved.length > 0);
    if (offenders.length > 0) {
      const list = offenders.map(o => `  ${o.path}: ${o.unresolved.join(', ')}`).join('\n');
      throw new Error(`Template has unresolved variables (strict mode):\n${list}`);
    }
  }
  return out;
}

async function walk(
  root: string,
  current: string,
  vars: TemplateVars,
  out: RenderedFile[],
  opts: { icm: boolean },
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const e of entries) {
    const full = join(current, e.name);
    if (e.isDirectory()) {
      // The ICM overlay is emitted only on opt-in; a flagless walk skips it
      // entirely so the emitted set stays byte-identical to upstream.
      if (e.name === ICM_OVERLAY_DIR && !opts.icm) continue;
      await walk(root, full, vars, out, opts);
      continue;
    }
    if (!e.isFile()) continue;
    const rel = toPosix(relative(root, full));
    if (!opts.icm && (rel === ICM_OVERLAY_DIR || rel.startsWith(`${ICM_OVERLAY_DIR}/`))) continue;
    if (rel.endsWith('/manifest.json') || rel === 'manifest.json') continue;
    if (rel.endsWith('.tmpl')) {
      const raw = await readFile(full, 'utf-8');
      const { output, unresolved } = render(raw, vars);
      out.push({
        path: rel.slice(0, -'.tmpl'.length),
        content: output,
        rendered: true,
        unresolved,
      });
    } else {
      const raw = await readFile(full, 'utf-8');
      out.push({ path: rel, content: raw, rendered: false, unresolved: [] });
    }
  }
}

/**
 * Convert a RenderedFile[] to the flat path -> content map that
 * fingerprintFiles() in manifest.ts expects.
 */
export function asFileMap(files: RenderedFile[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) out[f.path] = f.content;
  return out;
}
