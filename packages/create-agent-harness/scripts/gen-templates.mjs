// SPDX-License-Identifier: MIT
//
// Template generator. Reads the canonical catalog (templates/catalog.def.mjs)
// and materialises:
//
//   1. templates/<id>/ ...                  full .tmpl template dirs + manifest
//   2. templates/catalog.json               canonical metadata (CLI + Rust)
//
// Run from packages/create-agent-harness:  node scripts/gen-templates.mjs
// (or `npm run gen:templates`). Hand-authored templates (generate:false,
// e.g. minimal / vertical:devops) are listed in the catalog but never written
// here — the generator only owns the generate:true dirs.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, icmContentFor, icmQuestionsFor } from '../templates/catalog.def.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const templatesRoot = join(pkgRoot, 'templates');

const dirName = (id) => id.replace(':', '_');
const uniq = (arr) => [...new Set(arr)];

// --- per-file builders -----------------------------------------------------

// --- ICM (Interpretable Context Methodology) emission ----------------------
//
// Task 2.5 of the spec's task list. Content is single-sourced as data in
// templates/catalog.def.mjs (tasks 2.2-2.4); this generator materialises it per
// opt-in template. Deviations from the spec's draft text, both documented at the
// top of the task list and in the ADR:
//
//   1. No `templates/_icm/` dir. The walker has no include/overlay concept and
//      TEMPLATES_ROOT is a single hardcoded root, so shared content cannot be
//      referenced from outside a template dir. Data in the catalog is the
//      documented canonical source, so that is where it lives.
//   2. No manifest rows as the emission vehicle. scaffold() walks exactly one
//      root and the walker explicitly skips manifest.json, so a template
//      manifest row pointing at another dir is never read. Emission goes
//      through the standard walkTemplate() path; the rows below are an accurate
//      record of the tree, not the mechanism.
//
// The ICM files are emitted as PLAIN files, not `.tmpl`, on purpose. Stage
// contracts carry SCREAMING_SNAKE placeholders for the headless onboarding pass
// (task 4.2) and the lowercase-var renderer is non-strict — routing them
// through it would leave those placeholders in place silently and break the
// generated-templates test's `unresolved == []` contract. The one exception is
// root CLAUDE.md, which stays a `.tmpl` because the router is required to
// render `{{name}}` / `{{description}}` and must carry no SCREAMING_SNAKE
// placeholder at all (Layer 0 has to work before onboarding runs).

/** Stage rows for the canonical catalog.json, or null when not opted in. */
function icmJson(t) {
  const icm = t.icm ? icmContentFor(t) : null;
  if (!icm) return null;
  const stages = icm.files
    .filter((f) => f.path.endsWith('/CONTEXT.md'))
    .map((f) => ({ id: f.path.split('/')[1], dir: f.path.split('/').slice(0, 2).join('/') }));
  // Headless-onboarding question set (Unit 4). Derived from the ICM content
  // itself by `icmQuestionsFor`, so the catalog cannot advertise a question the
  // emitted tree does not carry (or vice versa). This is the CLI-visible form
  // of task 4.1's single-source requirement.
  const questions = icmQuestionsFor(t);
  return { enabled: true, layout: 'five-layer', stages, questions };
}

function manifestJson(t) {
  const files = [
    { src: 'package.json.tmpl', dst: 'package.json', render: true },
    { src: 'CLAUDE.md.tmpl', dst: 'CLAUDE.md', render: true },
    { src: 'README.md.tmpl', dst: 'README.md', render: true },
    { src: '.claude/settings.json.tmpl', dst: '.claude/settings.json', render: true },
    // iter 132 — every vertical scaffold now ships the Claude Code plugin
    // manifest so `claude -p --plugin-dir <harness>` works out of the box.
    { src: '.claude-plugin/plugin.json.tmpl', dst: '.claude-plugin/plugin.json', render: true },
    { src: 'src/init.ts.tmpl', dst: 'src/init.ts', render: true },
    ...t.agents.map((a) => ({ src: `src/agents/${a.id}.ts.tmpl`, dst: `src/agents/${a.id}.ts`, render: true })),
    ...t.skills.map((s) => ({ src: `.claude/skills/${s.id}/SKILL.md.tmpl`, dst: `.claude/skills/${s.id}/SKILL.md`, render: true })),
    ...t.commands.map((c) => ({ src: `.claude/commands/${c.id}.md.tmpl`, dst: `.claude/commands/${c.id}.md`, render: true })),
    // Per-template hand-maintained extras (upstream `extraFiles` in
    // catalog.def.mjs): vertical:devops ships runbooks/, vertical:support ships
    // kb/. They ride in front of the four standard hand-maintained files.
    ...((t.extraFiles ?? []).map((src) => ({ src, dst: src.replace(/\.tmpl$/, ''), render: true }))),
    // The runnable-package files. The generator writes .tmpl *sources* only for
    // the files it can build from catalog data; these four are hand-maintained
    // (added upstream in 45ba6cb so every vertical emits a runnable npx
    // package). Their manifest rows are declared here because the generator has
    // no builder for them and must not silently drop the rows it cannot fill —
    // that trim is what made a scaffolded harness advertise a `bin/cli.js` it no
    // longer contained.
    { src: 'tsconfig.json.tmpl', dst: 'tsconfig.json', render: true },
    { src: 'bin/cli.js.tmpl', dst: 'bin/cli.js', render: true },
    { src: '__tests__/smoke.test.ts.tmpl', dst: '__tests__/smoke.test.ts', render: true },
    // No ICM rows. The ICM payload rides in the `.icm/` overlay subtree, which
    // the walker skips unless the scaffold resolved `icm: true` for this
    // template (ADR-285: capability-derived, no user flag) — so it is not part
    // of this template's default output and must not appear in its manifest.
    // This manifest is a metadata index of the template dir (the walker skips
    // `manifest.json` itself and nothing in src/ reads this file); the ICM
    // files' drift coverage comes from `.harness/manifest.json` at scaffold
    // time, which records every emitted path. Keeping this file upstream-identical
    // is what keeps a no-flag regen a no-op (task 2.7 / task 2.9).
  ];
  return (
    JSON.stringify(
      {
        id: t.id,
        description: t.description,
        domain: t.domain,
        category: t.category,
        files,
        vars: [
          { name: 'name', prompt: 'Harness name (kebab-case)', validate: '^[a-z0-9-]+$' },
          { name: 'description', prompt: 'One-line description', default: t.harnessDesc },
          { name: 'host', prompt: 'Host adapter', default: 'claude-code', choices: ['claude-code', 'codex', 'pi-dev', 'hermes'] },
        ],
      },
      null,
      2,
    ) + '\n'
  );
}

function packageJsonTmpl() {
  return `{
  "name": "{{name}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "type": "module",
  "bin": {
    "{{name}}": "bin/cli.js"
  },
  "files": ["bin/**", "dist/**", "src/**", "tsconfig.json", ".claude/**", "CLAUDE.md", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "init": "node ./bin/cli.js init", "doctor": "node ./bin/cli.js doctor"
  },
  "dependencies": {
    "@metaharness/kernel": "^0.1.0",
    "@metaharness/host-{{host}}": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
`;
}

// iter 132 — Claude Code plugin manifest for `claude -p --plugin-dir <harness>`.
// Same shape as packages/create-agent-harness/templates/minimal/.claude-plugin/
// plugin.json.tmpl (iter 131) but with per-vertical categories + tags so the
// plugin shows up correctly when the harness is registered as a plugin in
// the Claude Code marketplace.
function pluginJsonTmpl(t) {
  const cats = ['agent-harness', 'metaharness-scaffold'];
  if (t.category) cats.push(t.category);
  if (t.domain) cats.push(t.domain);
  const tags = ['metaharness', 'agent-harness'];
  if (t.id) tags.push(t.id);
  if (t.domain && t.domain !== t.id) tags.push(t.domain);
  return JSON.stringify(
    {
      name: '{{name}}',
      version: '0.1.0',
      description: '{{description}}',
      author: {
        displayName: 'Generated by metaharness',
        url: 'https://www.npmjs.com/package/metaharness',
      },
      license: 'MIT',
      categories: uniq(cats),
      tags: uniq(tags),
      homepage: 'https://github.com/ruvnet/agent-harness-generator',
    },
    null,
    2,
  ) + '\n';
}

function settingsTmpl(t) {
  const mcp = t.mcp ?? [];
  const allow = uniq([
    'Bash(npx {{name}}*)',
    'mcp__{{name}}__*',
    ...mcp.map((m) => `mcp__${m.key}__*`),
    ...(t.allow ?? []),
  ]);
  const deny = uniq(['Read(./.env)', 'Read(./.env.*)', ...(t.deny ?? [])]);
  const mcpServers = {
    '{{name}}': { command: 'npx', args: ['-y', '{{name}}@latest', 'mcp', 'start'] },
  };
  for (const m of mcp) {
    mcpServers[m.key] = { command: 'npx', args: ['-y', '{{name}}@latest', 'mcp', m.sub] };
  }
  return JSON.stringify({ permissions: { allow, deny }, mcpServers }, null, 2) + '\n';
}

function initTmpl() {
  return `// SPDX-License-Identifier: MIT
// Generated by create-agent-harness — your harness's \`{{name}} init\` entry.

import { loadKernel } from '@metaharness/kernel';
import adapter from '@metaharness/host-{{host}}';

const HARNESS_NAME = '{{name}}';

async function main(): Promise<number> {
  const kernel = await loadKernel();
  const info = kernel.kernelInfo();
  console.log(\`\${HARNESS_NAME} — kernel \${info.version} (\${kernel.backend})\`);
  console.log(\`Host adapter: \${adapter.name}\`);
  console.log(\`Run \\\`\${HARNESS_NAME} doctor\\\` to verify the install.\`);
  return 0;
}

main().then(c => process.exit(c)).catch(err => {
  console.error(err);
  process.exit(1);
});
`;
}

function agentTmpl(a) {
  // Plain prose prompt -> safe to embed in a template literal (no backticks /
  // ${ in catalog prompts). The {{name}} tie-in is rendered by the walker.
  return `// SPDX-License-Identifier: MIT
// ${a.name} agent — ${a.role}

export const SYSTEM_PROMPT = \`${a.systemPrompt} You operate inside the {{name}} harness; defer destructive actions to the user.\`;

export const NAME = '${a.id}';
export const TIER = '${a.tier}' as const;
`;
}

function skillTmpl(s) {
  return `---
name: ${s.id}
description: ${yamlInline(s.description)}
---

# ${s.id}

${s.body}
`;
}

function commandTmpl(c) {
  return `---
description: ${yamlInline(c.description)}
---

${c.body}
`;
}

function claudeMdTmpl(t) {
  const agentRows = t.agents.map((a) => `| \`${a.id}\` | ${a.tier} | ${a.role} |`).join('\n');
  const skillList = t.skills.map((s) => `- \`/${s.id}\` — ${s.description}`).join('\n');
  const cmdList = t.commands.map((c) => `- \`${c.id}\` — ${c.description}`).join('\n');
  return `# {{name}}

{{description}}

> ${t.name} harness · domain: \`${t.domain}\`. Generated with [create-agent-harness](https://github.com/ruvnet/agent-harness-generator).

## Behavioral rules

- Use the harness's MCP tools (\`mcp__{{name}}__*\`) for orchestration
- Memory and routing are handled by the kernel — you don't need to learn them
- Defer destructive operations to the user

${t.agents.length ? `## Agents\n\n| Agent | Tier | Role |\n|---|---|---|\n${agentRows}\n` : ''}${t.skills.length ? `## Skills\n\n${skillList}\n` : ''}
## Commands

${cmdList}

## Architecture

This harness uses [@metaharness/kernel](https://www.npmjs.com/package/@metaharness/kernel) — a Rust-compiled WASM module with a NAPI-RS native fallback — so the same code runs identically on every platform.
`;
}

function readmeTmpl(t) {
  const agentRows = t.agents.map((a) => `| \`${a.id}\` | ${a.role} |`).join('\n');
  return `# {{name}}

{{description}}

> **${t.name}** — ${t.quickStart}
>
> Generated with [\`create-agent-harness\`](https://github.com/ruvnet/agent-harness-generator). Multi-host scaffolding with a kernel that resolves native → wasm → js (js backend in the published beta; see \`harness doctor\`).

## Install

\`\`\`bash
npm install -g {{name}}
{{name}} init
{{name}} doctor
\`\`\`

${t.agents.length ? `## Agents\n\n| Agent | Role |\n|---|---|\n${agentRows}\n` : ''}
This harness ships with the **{{host}}** adapter.

## License

MIT
`;
}

function yamlInline(s) {
  return /[:#{}[\],&*!|>'"%@`]/.test(s) || s.includes('\n') ? JSON.stringify(s) : s;
}

// --- catalog.json (canonical) ---------------------------------------------

function catalogJson() {
  const entries = CATALOG.map((t) => ({
    id: t.id,
    dir: dirName(t.id),
    category: t.category,
    name: t.name,
    domain: t.domain,
    description: t.description,
    harnessDesc: t.harnessDesc,
    quickStart: t.quickStart,
    tags: t.tags ?? [],
    generate: t.generate !== false,
    mcpServers: ['{{name}}', ...(t.mcp ?? []).map((m) => m.key)],
    agentCount: t.agents.length,
    skillCount: t.skills.length,
    commandCount: t.commands.length,
    agents: t.agents.map((a) => ({ id: a.id, name: a.name, tier: a.tier, role: a.role })),
    skills: t.skills.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    commands: t.commands.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    ...(icmJson(t) ? { icm: icmJson(t) } : {}),
  }));
  return JSON.stringify({ schema: 1, generatedBy: 'gen-templates.mjs', templates: entries }, null, 2) + '\n';
}

// --- write everything ------------------------------------------------------

async function writeFileMkdir(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

/**
 * Emit a template's ICM payload into its gated `.icm/` overlay subtree.
 *
 * Single-sourced: everything comes from `icmContentFor()` in catalog.def.mjs, so
 * the emitted tree and `catalog.json`'s `icm.stages` can never disagree.
 * No-op for a template without ICM content. The template's own `manifest.json`
 * is deliberately NOT touched — it indexes only the flagless template dir (the
 * ICM payload is invisible to a flagless walk), and keeping it upstream-identical
 * is what keeps a no-flag regen a no-op (task 2.7 / 2.9). Drift coverage for the
 * ICM files comes from `.harness/manifest.json` at scaffold time instead.
 */
async function emitIcmOverlay(root, t) {
  if (!t.icm) return;
  const icm = icmContentFor(t);
  if (!icm) return;
  await writeFileMkdir(join(root, '.icm', 'CLAUDE.md.tmpl'), icm.routerClaudeMd);
  for (const f of icm.files) {
    await writeFileMkdir(join(root, '.icm', ...f.path.split('/')), f.content);
  }
}

async function main() {
  let written = 0;
  for (const t of CATALOG) {
    // `minimal` is generate:false — upstream hand-maintains its dir, so the
    // builder below must NOT run for it (it would overwrite hand-maintained
    // sources and its manifest.json). Its ICM overlay is still emitted, from the
    // same `icmContentFor()` source as every other template, right below: task
    // 2.6 called for hand-authoring that content, but hand-copying it is exactly
    // the second encoding the single-source design forbids — `catalog.json`
    // advertises minimal's stages, and the emitter is what must produce them.
    const root = join(templatesRoot, dirName(t.id));
    if (t.generate === false) {
      if (t.icm) await emitIcmOverlay(root, t);
      continue;
    }
    // Do NOT rm -rf `root`. This generator only owns a known subset of each
    // template dir; the dirs also carry hand-maintained files that main() has
    // no builder for — bin/cli.js.tmpl, tsconfig.json.tmpl,
    // vitest.config.ts.tmpl, __tests__/smoke.test.ts.tmpl (added in 45ba6cb to
    // make the templates runnable). Wiping the dir destroyed those on every run,
    // which broke `npm test` (28 ENOENT failures) and made task 2.7's
    // idempotence requirement unreachable: the second run could never reproduce
    // the first tree. Generated files are all rewritten below, so overwriting in
    // place is both sufficient and non-destructive.
    await writeFileMkdir(join(root, 'manifest.json'), manifestJson(t));
    await writeFileMkdir(join(root, 'package.json.tmpl'), packageJsonTmpl());
    // Root `CLAUDE.md.tmpl` always carries the template's own variant, exactly
    // as upstream writes it. The ICM router is NOT written here: it lives in the
    // `.icm/` overlay, so a template without ICM capability keeps emitting the
    // upstream file. Writing the router over this path (the first cut of this
    // work) silently made *every* scaffold of vertical:coding emit the 73-line
    // router instead of upstream's 32-line banner — the merge-safety defect
    // ADR-279 calls a defect "even if ICM itself is correct". The overlay owns
    // the ICM variant and wins the collision at scaffold time.
    await writeFileMkdir(join(root, 'CLAUDE.md.tmpl'), claudeMdTmpl(t));
    // ICM tree (task 2.5), under the gated `.icm/` overlay subtree.
    await emitIcmOverlay(root, t);
    await writeFileMkdir(join(root, 'README.md.tmpl'), readmeTmpl(t));
    await writeFileMkdir(join(root, '.claude', 'settings.json.tmpl'), settingsTmpl(t));
    // iter 132 — emit per-vertical plugin manifest
    await writeFileMkdir(join(root, '.claude-plugin', 'plugin.json.tmpl'), pluginJsonTmpl(t));
    await writeFileMkdir(join(root, 'src', 'init.ts.tmpl'), initTmpl());
    for (const a of t.agents) await writeFileMkdir(join(root, 'src', 'agents', `${a.id}.ts.tmpl`), agentTmpl(a));
    for (const s of t.skills) await writeFileMkdir(join(root, '.claude', 'skills', s.id, 'SKILL.md.tmpl'), skillTmpl(s));
    for (const c of t.commands) await writeFileMkdir(join(root, '.claude', 'commands', `${c.id}.md.tmpl`), commandTmpl(c));
    written++;
  }
  await writeFile(join(templatesRoot, 'catalog.json'), catalogJson(), 'utf-8');

  console.log(`✓ generated ${written} template dirs`);
  console.log(`✓ wrote templates/catalog.json (${CATALOG.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
