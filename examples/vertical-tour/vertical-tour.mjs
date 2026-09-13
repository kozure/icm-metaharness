#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// examples/vertical-tour/vertical-tour.mjs
//
// Analogue of iter-55's host-tour: scaffold + validate EVERY vertical
// in one run, surfacing markdown table + the one vertical that drifts
// (if any). Closes the per-vertical-example combinatorial trap:
// instead of writing a separate examples/<vertical>/ for each of 18
// templates, this one script proves the whole catalog scaffolds
// cleanly. Adding a new vertical is two lines in catalog.def.mjs +
// healthcheck catalogCount; this tour automatically covers it.
//
// Run with:
//   node examples/vertical-tour/vertical-tour.mjs                  # default host claude-code
//   node examples/vertical-tour/vertical-tour.mjs --host=codex     # any of 6 hosts
//   node examples/vertical-tour/vertical-tour.mjs --json           # machine output

import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold, TEMPLATES, loadCatalog } from '../../packages/create-agent-harness/dist/index.js';
import { validate } from '../../packages/create-agent-harness/dist/validate.js';

function parseFlag(name, fallback) {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}

async function countFiles(dir) {
  let n = 0;
  let bytes = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = await countFiles(p);
      n += sub.n;
      bytes += sub.bytes;
    } else {
      n += 1;
      const st = await stat(p);
      bytes += st.size;
    }
  }
  return { n, bytes };
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}K`;
}

async function tour(template, host) {
  const slug = template.replace(/[^a-z0-9]/gi, '-');
  const dir = await mkdtemp(join(tmpdir(), `ahg-vtour-${slug}-`));
  const t0 = Date.now();
  try {
    await scaffold({
      name: `${slug}-bot`,
      template,
      host,
      description: `vertical-tour iter 88 — ${template}`,
      targetDir: dir,
      force: true,
      generatorVersion: '0.1.0',
    });
    const { n, bytes } = await countFiles(dir);
    const v = await validate([dir, '--skip-gcp']);
    const healthy = v.lines.join('\n').includes('Result: HEALTHY');
    const dt = Date.now() - t0;
    return { template, host, n, bytes, dt, healthy };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// ICM pass (task 3.8)
//
// The tour above scaffolds flaglessly, so by construction it never sees the
// `.icm/` overlay. This pass covers the artifacts the flag actually emits,
// driven from the catalog's `icm` blocks — the same single source the
// `icm-structure` validator reads — so no second list of stages can rot here.
//
// It is deliberately a separate pass rather than a `--icm` argument to every
// vertical: the flagless path is the byte-equality guarantee, and folding the
// two would make a flagless scaffold's file counts ambiguous in the table.

const ICM_STAGE_LINE_BUDGET = 80;
/** Onboarding placeholders (must survive) vs. Mustache vars (must not leak). */
const SCREAMING_SNAKE = /\{\{[A-Z][A-Z0-9_]*\}\}/g;
const ANY_MUSTACHE = /\{\{[^{}]*\}\}/g;

async function walkAll(dir, prefix = '') {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...(await walkAll(join(dir, ent.name), rel)));
    else out.push(rel);
  }
  return out;
}

async function icmCheck(template, icm) {
  const slug = template.replace(/[^a-z0-9]/gi, '-');
  const dir = await mkdtemp(join(tmpdir(), `ahg-icm-${slug}-`));
  try {
    await scaffold({
      name: `${slug}-bot`,
      template,
      host: 'claude-code',
      description: `icm-tour — ${template}`,
      targetDir: dir,
      force: true,
      generatorVersion: '0.1.0',
      icm: true,
    });

    const files = await walkAll(dir);
    // The catalog block's first row is the Layer 3 navigation file
    // (`dir: references/CONTEXT.md`), not a stage — the stage rows are the
    // ones under `stages/`. Take `dir` verbatim: it is already zero-padded and
    // is the single encoding of the emitted path, so deriving it again here
    // would be the second list the design forbids.
    const stageDirs = (icm.stages ?? []).map(s => s.dir).filter(d => d.startsWith('stages/'));

    // Zero-padded, ordered stage dirs, exactly matching the catalog list.
    const expectedDirs = stageDirs;
    for (const d of expectedDirs) {
      if (!files.includes(`${d}/CONTEXT.md`)) return `missing ${d}/CONTEXT.md`;
      if (!files.includes(`${d}/output/.gitkeep`)) return `missing ${d}/output/.gitkeep`;
    }
    const seenDirs = [...new Set(files.filter(f => f.startsWith('stages/')).map(f => f.split('/').slice(0, 2).join('/')))];
    if (seenDirs.join(',') !== expectedDirs.join(',')) {
      return `stage dirs drift: emitted [${seenDirs.join(', ')}] != catalog [${expectedDirs.join(', ')}]`;
    }

    // Root layers present.
    for (const p of ['CONTEXT.md', 'references/CONTEXT.md']) {
      if (!files.includes(p)) return `missing ${p}`;
    }
    // No per-stage references/ dirs (the amended Unit 2 FR — Layer 3 is workspace-level).
    const stray = seenDirs.filter(d => files.some(f => f.startsWith(`${d}/references/`)));
    if (stray.length > 0) return `per-stage references/ dirs emitted: ${stray.join(', ')}`;

    // Per stage: under the line budget, and only SCREAMING_SNAKE placeholders —
    // a lowercase Mustache var means the renderer ate a contract's placeholder.
    for (const d of expectedDirs) {
      const body = await readFile(join(dir, `${d}/CONTEXT.md`), 'utf-8');
      const lines = body.split('\n').length;
      if (lines > ICM_STAGE_LINE_BUDGET) return `${d}/CONTEXT.md is ${lines} lines (budget ${ICM_STAGE_LINE_BUDGET})`;
      const tokens = body.match(ANY_MUSTACHE) ?? [];
      // A conditional marker (`{{?X}}` / `{{/X}}`) is legitimate; a lowercase
      // Mustache var is not — that is the renderer having substituted a contract.
      const leaked = tokens.filter(tok => !/^\{\{[?/]/.test(tok) && !/^\{\{[A-Z][A-Z0-9_]*\}\}$/.test(tok));
      if (leaked.length > 0) return `${d}/CONTEXT.md leaked Mustache vars: ${leaked.join(', ')}`;
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const host = parseFlag('host', 'claude-code');
  const jsonOut = process.argv.includes('--json');

  // Tour the actually-registered TEMPLATES export from the built
  // generator — if someone adds a template to catalog.def.mjs but
  // forgets to update TEMPLATES, this script automatically surfaces
  // the drift instead of pinning a duplicate list here.
  const templates = TEMPLATES.filter(t => t !== 'minimal');

  process.stderr.write(`agent-harness-generator — vertical tour\n`);
  process.stderr.write(`scaffolding ${templates.length} verticals on host ${host}\n\n`);

  const reports = [];
  const t0 = Date.now();
  for (const tpl of templates) {
    try {
      reports.push(await tour(tpl, host));
    } catch (err) {
      reports.push({
        template: tpl, host, n: 0, bytes: 0, dt: 0, healthy: false,
        error: err?.message ?? String(err),
      });
    }
  }
  const total = Date.now() - t0;

  // ICM pass: every catalog template that advertises an `icm` block gets a
  // `--icm` scaffold whose emitted tree is checked against that block.
  const catalog = loadCatalog();
  const icmTemplates = catalog.filter(t => t.icm);
  process.stderr.write(`\nICM pass — ${icmTemplates.length} template(s) with an icm block\n`);
  const icmReports = [];
  for (const t of icmTemplates) {
    let problem;
    try {
      problem = await icmCheck(t.id, t.icm);
    } catch (err) {
      problem = err?.message ?? String(err);
    }
    icmReports.push({ template: t.id, stages: t.icm.stages?.length ?? 0, problem });
    if (problem) process.stderr.write(`  - ${t.id}: ${problem}\n`);
  }
  const icmFailed = icmReports.filter(r => r.problem);

  if (jsonOut) {
    const failed = reports.filter(r => !r.healthy);
    process.stdout.write(JSON.stringify({
      host, count: templates.length, reports, totalMs: total,
      failed: failed.length, ok: failed.length === 0,
      icm: { count: icmReports.length, reports: icmReports, failed: icmFailed.length },
    }, null, 2) + '\n');
    process.exit(failed.length === 0 && icmFailed.length === 0 ? 0 : 1);
  }

  process.stdout.write('# Vertical Tour — output\n\n');
  process.stdout.write(`| Template | files | bytes | wall | validate |\n`);
  process.stdout.write(`|----------|-------|-------|------|----------|\n`);
  for (const r of reports) {
    process.stdout.write(
      `| \`${r.template}\` | ${r.n} | ${fmtBytes(r.bytes)} | ${r.dt}ms | ${r.healthy ? 'HEALTHY' : 'FAIL'} |\n`
    );
  }
  process.stdout.write(`\nTotal wall time: ${total}ms across ${reports.length} verticals (host=${host}).\n`);

  process.stdout.write(`\n## ICM pass (\`--icm\` scaffold, checked against the catalog block)\n\n`);
  process.stdout.write(`| Template | stages | icm tree |\n`);
  process.stdout.write(`|----------|--------|----------|\n`);
  for (const r of icmReports) {
    process.stdout.write(`| \`${r.template}\` | ${r.stages} | ${r.problem ? `FAIL — ${r.problem}` : 'OK'} |\n`);
  }
  process.stdout.write(`\nICM pass: ${icmReports.length - icmFailed.length}/${icmReports.length} OK.\n`);

  const failed = reports.filter(r => !r.healthy);
  if (failed.length > 0 || icmFailed.length > 0) {
    if (failed.length > 0) {
      process.stderr.write(`\n[vertical-tour] FAIL: ${failed.length} of ${reports.length} verticals failed\n`);
      for (const r of failed) {
        process.stderr.write(`  - ${r.template}${r.error ? ` (${r.error})` : ''}\n`);
      }
    }
    if (icmFailed.length > 0) {
      process.stderr.write(`\n[vertical-tour] FAIL: ${icmFailed.length} of ${icmReports.length} ICM trees drifted\n`);
    }
    process.exit(1);
  }
  process.stderr.write(`\n[vertical-tour] DONE — ${reports.length}/${reports.length} verticals HEALTHY, ${icmReports.length}/${icmReports.length} ICM trees OK in ${total}ms\n`);
}

main().catch(err => {
  process.stderr.write(`[vertical-tour] FAIL: ${err?.stack ?? err}\n`);
  process.exit(1);
});
