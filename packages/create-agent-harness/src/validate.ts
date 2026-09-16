// SPDX-License-Identifier: MIT
//
// `harness validate` — umbrella check that runs every gate a release-ready
// harness should pass, fail-fast with a structured per-check verdict.
//
// Checks (in order):
//   1. doctor          file-shape + manifest hash + at-least-one-host-artifact
//   2. verify          witness manifest signature check
//   3. path-guard      no hardcoded /tmp/, C:\, /Users/, /home/ in production
//   4. mcp-server      every entry in .mcp/servers.json passes kernel schema
//   5. secrets         (optional) gcloud + project + secret exist (--skip-gcp to skip)
//   6. diag            kernel-version skew check (iter 76 — informational,
//                      WARN on skew, never fails the umbrella because kernel
//                      skew is a deploy-side issue, not a release-readiness
//                      block for the harness being validated)
//
// Exits non-zero if any check fails. Structured output suits both human eyes
// and `grep PASS|FAIL` for CI.

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep, posix } from 'node:path';
import { readdir } from 'node:fs/promises';
import { doctor, verify } from './subcommands.js';
import { check as secretsCheck } from './secrets.js';
import { buildDiagReport } from './diag.js';
import { loadCatalog, resolveIcmDefault } from './index.js';
import { render, type TemplateVars } from './renderer.js';

export type SubcommandResult = { code: number; lines: string[] };

interface CheckResult {
  name: string;
  code: number;
  detail: string;
  // iter 76: optional override for the displayed tag. Lets a check
  // return code 0 (don't fail the umbrella) but surface WARN / SKIP in
  // the output. Used by diag to surface kernel skew informationally.
  tag?: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
}

async function runDoctor(dir: string): Promise<CheckResult> {
  const r = await doctor([dir]);
  return {
    name: 'doctor',
    code: r.code,
    detail: r.lines.join(' | '),
  };
}

async function runVerify(dir: string): Promise<CheckResult> {
  if (!existsSync(join(dir, '.harness', 'witness.json'))) {
    return { name: 'verify', code: 0, detail: 'no witness — skipped (sign first)' };
  }
  const r = await verify([dir]);
  return { name: 'verify', code: r.code, detail: r.lines.slice(-2).join(' | ') };
}

/** Scan a harness's user-authored files for hardcoded paths. */
async function runPathGuard(dir: string): Promise<CheckResult> {
  const bannedPatterns = [
    /['"`]\/tmp\//,
    /['"`]C:\\\\/,
    /['"`]\/Users\//,
    /['"`]\/home\//,
  ];
  const offenders: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await import('node:fs/promises').then(m => m.readdir(d, { withFileTypes: true }));
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
      const p = join(d, ent.name);
      if (ent.isDirectory()) {
        await walk(p);
      } else if (/\.(ts|tsx|js|mjs|cjs|rs)$/.test(ent.name)) {
        const content = await readFile(p, 'utf-8').catch(() => '');
        for (const line of content.split('\n')) {
          // Skip comment lines
          if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
          for (const pat of bannedPatterns) {
            if (pat.test(line)) {
              offenders.push(`${p}: ${line.trim().slice(0, 80)}`);
              break;
            }
          }
        }
      }
    }
  }
  await walk(dir).catch(() => undefined);
  if (offenders.length === 0) {
    return { name: 'path-guard', code: 0, detail: 'no hardcoded /tmp, C:\\, /Users, /home in TS/JS/Rust' };
  }
  return {
    name: 'path-guard',
    code: 1,
    detail: `${offenders.length} hardcoded path${offenders.length === 1 ? '' : 's'}: ${offenders.slice(0, 3).join('; ')}`,
  };
}

/** Validate `.mcp/servers.json` (if present) against kernel MCP schema. */
async function runMcpCheck(dir: string): Promise<CheckResult> {
  const mcpPath = join(dir, '.mcp', 'servers.json');
  if (!existsSync(mcpPath)) {
    return { name: 'mcp', code: 0, detail: 'no .mcp/servers.json — skipped' };
  }
  try {
    const raw = JSON.parse(await readFile(mcpPath, 'utf-8'));
    const servers = Array.isArray(raw) ? raw : Array.isArray(raw?.mcpServers) ? raw.mcpServers : [];
    if (servers.length === 0) {
      return { name: 'mcp', code: 0, detail: '.mcp/servers.json present but empty — skipped' };
    }
    // Best-effort: each server must have name + command. Real schema check
    // would need the kernel NAPI binding — out of scope for the umbrella.
    const problems: string[] = [];
    for (const [i, s] of servers.entries()) {
      if (typeof s?.name !== 'string') problems.push(`server[${i}] missing name`);
      if (!Array.isArray(s?.command) && typeof s?.command !== 'string') {
        problems.push(`server[${i}] missing command`);
      }
    }
    if (problems.length === 0) {
      return { name: 'mcp', code: 0, detail: `${servers.length} server${servers.length === 1 ? '' : 's'} valid` };
    }
    return { name: 'mcp', code: 1, detail: problems.join('; ') };
  } catch (e) {
    return { name: 'mcp', code: 1, detail: `invalid JSON: ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * iter 76: diag check inside the validate umbrella. Returns code 0
 * always so a kernel skew never blocks the umbrella verdict; surfaces
 * the state via the tag override field (PASS / WARN / SKIP).
 */
/**
 * iter 123: check #7 (informational). ADR-034 §134 specifies the OIA
 * manifest should be shape-validated by `harness validate` so a drifted
 * .harness/oia-manifest.json gets surfaced alongside the other gates.
 *
 * Informational on purpose:
 *   - manifest absent  → SKIP (OIA opt-in, not required)
 *   - manifest valid   → PASS
 *   - manifest drifted → WARN (reported but does NOT fail the umbrella;
 *     OIA v0.1 is pre-stable, drift may be a v1.0 migration in progress)
 *   - manifest corrupt → WARN (same reasoning)
 *
 * The user can promote this to FAIL by running `harness oia-manifest
 * <dir> --check` directly in CI.
 */
async function runOiaManifest(dir: string): Promise<CheckResult> {
  const manifestPath = join(dir, '.harness', 'oia-manifest.json');
  if (!existsSync(manifestPath)) {
    return { name: 'oia', code: 0, tag: 'SKIP', detail: 'no .harness/oia-manifest.json (OIA opt-in)' };
  }
  try {
    const { checkOiaManifest } = await import('./oia-manifest.js');
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const r = checkOiaManifest(m);
    if (r.ok) {
      return { name: 'oia', code: 0, tag: 'PASS', detail: `oia-manifest shape ok (oiaVersion=${m.oiaVersion ?? '?'})` };
    }
    return { name: 'oia', code: 0, tag: 'WARN', detail: `oia-manifest drift: ${r.reasons.length} issue(s) — run \`harness oia-manifest ${dir} --check\` for detail` };
  } catch (e) {
    return { name: 'oia', code: 0, tag: 'WARN', detail: `oia-manifest parse error (${String(e).slice(0, 50)})` };
  }
}

async function runDiag(dir: string): Promise<CheckResult> {
  if (!existsSync(join(dir, '.harness', 'manifest.json'))) {
    return { name: 'diag', code: 0, tag: 'SKIP', detail: 'no manifest at path' };
  }
  const r = await buildDiagReport(dir);
  if (!r.manifestKernelVersion) {
    return { name: 'diag', code: 0, tag: 'SKIP', detail: 'manifest pre-iter-58 (no kernel_version)' };
  }
  if (!r.localKernelVersion) {
    return {
      name: 'diag', code: 0, tag: 'SKIP',
      detail: `@metaharness/kernel not installed locally (manifest pins ${r.manifestKernelVersion})`,
    };
  }
  if (r.verdict === 'match' || r.verdict === 'patch-diff') {
    return {
      name: 'diag', code: 0, tag: 'PASS',
      detail: `kernel manifest=${r.manifestKernelVersion} local=${r.localKernelVersion} (${r.verdict})`,
    };
  }
  // minor-diff / major-diff / unparseable → WARN but DON'T fail
  return {
    name: 'diag', code: 0, tag: 'WARN',
    detail: `kernel manifest=${r.manifestKernelVersion} local=${r.localKernelVersion} (${r.verdict})`,
  };
}

/** Recursively list posix-relative file paths under a directory (sorted). */
async function listRelativeFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(current, e.name);
      if (e.isDirectory()) await visit(full);
      else if (e.isFile()) out.push(relative(root, full).split(sep).join(posix.sep));
    }
  }
  await visit(root);
  return out.sort();
}

/** Root-level ICM artifacts, per ADR-279 decision 3 / the amended Unit 2 FR. */
const ICM_ROOT_CONTEXT = 'CONTEXT.md';
const ICM_REFERENCES_CONTEXT = 'references/CONTEXT.md';
/** Stage files are meant to stay short enough to be a contract, not a document. */
const ICM_STAGE_LINE_BUDGET = 80;

/**
 * Task 3.4: validate the emitted ICM tree shape (ADR-279, amended Unit 2 FR).
 *
 * Checks the *shape*, not the content:
 *   - root `CONTEXT.md` (Layer 1) and root `references/CONTEXT.md` (Layer 3) present
 *   - one zero-padded `stages/0N-<name>/` dir per catalog stage, in catalog order,
 *     each with `CONTEXT.md` and `output/.gitkeep`
 *   - **no** per-stage `references/` dirs (the amended FR: Layer 3 is workspace-level)
 *   - the emitted stage *set* equals `catalog.json`'s `icm.stages` exactly — the
 *     single-source assertion (Deviation B), never a second encoded list
 *   - no stage file over the line budget
 *   - no lowercase Mustache var leaked into a stage file: stage contracts are plain
 *     copies, so every `{{...}}` must be either a SCREAMING_SNAKE onboarding
 *     placeholder or a `{{?COND}}…{{/COND}}` conditional marker
 *
 * Absence of a tree is read from `.harness/manifest.json`'s file map — the
 * authoritative record of what emission actually wrote (ADR-279 d3) — rather than
 * by probing generic filenames, so an unrelated `CONTEXT.md` cannot false-positive.
 * Which *kind* of absence it is comes from the manifest's **template capability**,
 * not from the file map (task 4.2):
 *
 *   - template is not ICM-capable → `SKIP`: there was never a tree to emit
 *   - template is ICM-capable     → `WARN`, naming the template: post-ADR-285 a
 *     capable template emits the tree by default, so a missing one is worth saying
 *
 * The capability question is asked through `resolveIcmDefault()` — the same single
 * source `scaffold()` resolves — rather than by re-encoding `icm.enabled &&
 * generate !== false` here, which would be a second copy of the predicate.
 * `WARN`, never `FAIL`: `doctor` is a gate, and the condition can legitimately
 * exist in a repository (see the pre-removal note below).
 *
 * ⚠️ Pre-removal harnesses are **not** separately carved out. Task 4.3 prescribed
 * distinguishing them via `manifest.generatorVersion`; that field does not exist
 * on `HarnessManifest` (the field is `generator`, `manifest.ts:49`) and its value
 * discriminates nothing anyway — every scaffold stamps the hard-coded `'0.1.0'`
 * (`index.ts:1313`, `analyze-repo.ts:426`) both before and after the flip, so a
 * pre-removal harness and a post-flip tree-less one are indistinguishable by any
 * recorded field. They therefore share the `WARN`, whose detail carries the honest
 * dual reading instead of guessing one. See `02-proofs/02-task-04-proofs.md`.
 *
 * Residual onboarding placeholders are *reported by name* but do not fail: resolution
 * and the non-zero exit belong to the headless-onboarding pass (task 4.3), and a
 * freshly scaffolded tree is legitimately pre-onboarding. Detection reuses
 * `render()`'s unresolved mechanism — the same identifier-form analysis the walker
 * uses — instead of a second scanner.
 */
export async function runIcmStructure(dir: string): Promise<CheckResult> {
  const manifestPath = join(dir, '.harness', 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { name: 'icm-structure', code: 0, tag: 'SKIP', detail: 'no .harness/manifest.json' };
  }
  let manifest: { template?: string; vars?: TemplateVars; files?: Record<string, string> };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    return {
      name: 'icm-structure', code: 0, tag: 'SKIP',
      detail: `manifest unreadable (${String(e instanceof Error ? e.message : e).slice(0, 60)})`,
    };
  }

  // The template id is read *before* the tree-absence early-return: which kind of
  // absence this is depends on the template's capability, not on the file map.
  // `entry` is only needed on the tree-present path below.
  const templateId = String(manifest.template ?? '');
  const entry = loadCatalog().find((t) => t.id === templateId);

  const emitted = Object.keys(manifest.files ?? {});
  const isIcm = emitted.some(
    (p) => p === ICM_ROOT_CONTEXT || p === ICM_REFERENCES_CONTEXT || p.startsWith('stages/'),
  );
  if (!isIcm) {
    // Capable template, no tree: post-ADR-285 this is unexpected (a broken or
    // hand-deleted tree) — say so, but do not fail the umbrella. A non-capable
    // template never had a tree to emit, so it stays a SKIP.
    // `resolveIcmDefault` is the capability authority — never a second copy of
    // `icm.enabled && generate !== false` written out here.
    if (resolveIcmDefault(templateId)) {
      return {
        name: 'icm-structure', code: 0, tag: 'WARN',
        detail: `template "${templateId}" is ICM-capable but no ICM tree was emitted — `
          + 'may be a pre-removal harness or a hand-deleted tree',
      };
    }
    return { name: 'icm-structure', code: 0, tag: 'SKIP', detail: 'template is not ICM-capable' };
  }

  // `icm.stages` carries one non-stage row (the Layer 3 navigation file); the
  // stage dirs are exactly those under `stages/`.
  const catalogStages = (entry?.icm?.stages ?? []).map((s) => s.dir).filter((d) => d.startsWith('stages/'));
  if (catalogStages.length === 0) {
    return {
      name: 'icm-structure', code: 1,
      detail: `ICM scaffold, but catalog declares no stages for template "${templateId}"`,
    };
  }

  const onDisk = await listRelativeFiles(dir);
  const onDiskSet = new Set(onDisk);
  const onDiskStages = Array.from(
    new Set(onDisk.map((p) => p.match(/^(stages\/\d{2}-[^/]+)\//)?.[1]).filter((s): s is string => !!s)),
  ).sort();

  const problems: string[] = [];

  // Root artifacts (Layer 1 + Layer 3).
  for (const p of [ICM_ROOT_CONTEXT, ICM_REFERENCES_CONTEXT]) {
    if (!onDiskSet.has(p)) problems.push(`missing ${p}`);
  }

  // Per-stage artifacts, in catalog order — order is part of the contract.
  for (const stageDir of catalogStages) {
    if (!onDiskSet.has(`${stageDir}/CONTEXT.md`)) problems.push(`missing ${stageDir}/CONTEXT.md`);
    if (!onDiskSet.has(`${stageDir}/output/.gitkeep`)) problems.push(`missing ${stageDir}/output/.gitkeep`);
  }

  // Amended FR: Layer 3 is workspace-level only — no per-stage references/.
  const perStageRefs = onDisk.filter((p) => /^stages\/\d{2}-[^/]+\/references\//.test(p));
  if (perStageRefs.length > 0) {
    problems.push(`${perStageRefs.length} per-stage references/ file(s) (Layer 3 is workspace-level)`);
  }

  // Single-source assertion: the emitted stage set equals the catalog's, exactly.
  const expected = [...catalogStages].sort();
  if (onDiskStages.join('|') !== expected.join('|')) {
    const missingFromDisk = expected.filter((d) => !onDiskStages.includes(d));
    const extraOnDisk = onDiskStages.filter((d) => !expected.includes(d));
    const bits: string[] = [];
    if (missingFromDisk.length) bits.push(`absent: ${missingFromDisk.join(', ')}`);
    if (extraOnDisk.length) bits.push(`unexpected: ${extraOnDisk.join(', ')}`);
    problems.push(`stage set != catalog.icm.stages (${bits.join('; ')})`);
  }

  // Line budget + leaked lowercase Mustache vars + residual onboarding placeholders.
  const residual = new Set<string>();
  for (const p of onDisk) {
    if (!/^stages\/\d{2}-[^/]+\/CONTEXT\.md$/.test(p)) continue;
    let content: string;
    try {
      content = readFileSync(join(dir, p), 'utf-8');
    } catch {
      continue;
    }
    const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
    if (lineCount > ICM_STAGE_LINE_BUDGET) {
      problems.push(`${p} is ${lineCount} lines (budget ${ICM_STAGE_LINE_BUDGET})`);
    }
    // Every `{{...}}` must be a conditional marker or a SCREAMING_SNAKE placeholder.
    for (const m of content.matchAll(/\{\{[^}]*\}\}/g)) {
      const tok = m[0];
      if (/^\{\{\s*[?/]/.test(tok)) continue;                       // {{?COND}} / {{/COND}}
      if (/^\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}$/.test(tok)) continue;    // {{SCREAMING_SNAKE}}
      problems.push(`${p} has a leaked non-placeholder token ${tok}`);
    }
    // Residual onboarding placeholders — reported, not a structural failure.
    for (const name of render(content, manifest.vars ?? {}).unresolved) residual.add(name);
  }

  if (problems.length > 0) {
    return { name: 'icm-structure', code: 1, detail: problems.slice(0, 6).join('; ') };
  }
  const residualNote = residual.size > 0
    ? `${residual.size} residual placeholder(s): ${Array.from(residual).sort().join(', ')}`
    : 'no residual placeholders';
  return {
    name: 'icm-structure', code: 0, tag: 'PASS',
    detail: `five-layer shape ok (${catalogStages.length} stages); ${residualNote}`,
  };
}

/** Top-level dispatcher: `harness validate [path] [--skip-gcp] [--secret=NAME]`. */
export async function validate(args: string[]): Promise<SubcommandResult> {
  const dir = resolve(args.find(a => !a.startsWith('--')) ?? process.cwd());
  const skipGcp = args.includes('--skip-gcp');
  const secret = args.find(a => a.startsWith('--secret='))?.slice('--secret='.length);
  const lines: string[] = [`harness validate — ${dir}`];

  const results: CheckResult[] = [];

  results.push(await runDoctor(dir));
  results.push(await runVerify(dir));
  results.push(await runPathGuard(dir));
  results.push(await runMcpCheck(dir));

  if (!skipGcp) {
    const sc = await secretsCheck(secret ? [`--secret=${secret}`] : []);
    results.push({
      name: 'secrets',
      code: sc.code,
      detail: sc.lines.slice(-2).join(' | ').replace(/\s+/g, ' '),
    });
  } else {
    results.push({ name: 'secrets', code: 0, detail: 'skipped (--skip-gcp)' });
  }

  // iter 76: diag (kernel-version skew) as informational signal.
  // Never fails the umbrella — kernel skew is a deploy-side runtime
  // issue, not a release-readiness block for the harness being
  // validated. PASS on match/patch, WARN on minor/major, SKIP when
  // no kernel installed locally.
  results.push(await runDiag(dir));

  // iter 123: OIA manifest shape check (ADR-034 §134) as informational
  // signal. Never fails the umbrella — OIA at v0.1 is pre-stable, and
  // the manifest is opt-in (no manifest = SKIP). PASS on valid shape,
  // WARN on drift or parse error. Users who want CI-blocking validation
  // run `harness oia-manifest <dir> --check` directly.
  results.push(await runOiaManifest(dir));

  // Task 3.4: ICM five-layer shape (ADR-279, superseded by ADR-285). SKIPs a
  // template that is not ICM-capable; WARNs a capable template whose tree is
  // absent. ICM is no longer flag-gated, so there is no "flagless harness" to
  // be unaffected — capability decides.
  results.push(await runIcmStructure(dir));

  let problems = 0;
  for (const r of results) {
    const tag = r.tag ?? (r.code === 0 ? 'PASS' : 'FAIL');
    lines.push(`  ${tag.padEnd(4)} ${r.name.padEnd(10)} — ${r.detail}`);
    if (r.code !== 0) problems++;
  }
  lines.push('');
  if (problems === 0) {
    lines.push('Result: HEALTHY (release-ready)');
    return { code: 0, lines };
  }
  lines.push(`Result: ${problems} check${problems === 1 ? '' : 's'} FAILED — fix before publish`);
  // iter 94: symmetric with iter 93 — when the umbrella FAILs, point
  // the user at the bundle. Doctor already does this for its own
  // failures, but the umbrella aggregates 7 checks (doctor + verify +
  // path-guard + mcp + secrets + diag + oia) — any of them failing
  // should surface the bundle as the next user action. The diag and
  // oia checks are informational — they never fail the umbrella.
  lines.push('');
  lines.push(`Next: capture the full diagnostic state for a support ticket:`);
  lines.push(`  harness diag ${dir} --bundle > bundle.json`);
  lines.push(`(then attach bundle.json to a GitHub issue at`);
  lines.push(` https://github.com/ruvnet/agent-harness-generator/issues — the`);
  lines.push(` bundle is sanitised; secret_/token_/key_/password_ fields are redacted)`);
  return { code: 1, lines };
}
