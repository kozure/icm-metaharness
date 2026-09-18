// SPDX-License-Identifier: MIT
//
// Cross-skill schema validation for .codex/skills/*/skill.toml manifests.
// Catches missing required fields BEFORE they ship to a Codex install
// where the error would be opaque.

import { describe, it, expect } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG } from '../packages/create-agent-harness/templates/catalog.def.mjs';
import { HOSTS } from '../packages/create-agent-harness/src/index.js';

const SKILLS_DIR = join(process.cwd(), '.codex', 'skills');

interface ParsedSkill {
  raw: string;
  name?: string;
  version?: string;
  description?: string;
  dispatchType?: string;
  dispatchServer?: string;
  dispatchCommand?: string;
  commandName?: string;
  args: Array<{ name: string; prompt?: string; required?: boolean }>;
  tags: string[];
}

// Tiny TOML reader — only the subset we use. Not for general TOML, on purpose.
function parseSkillToml(raw: string): ParsedSkill {
  const out: ParsedSkill = { raw, args: [], tags: [] };
  let section = '';
  let currentArg: { name: string; prompt?: string; required?: boolean } | null = null;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const arrayHeader = line.match(/^\[\[(\w+)\]\]$/);
    const header = line.match(/^\[(\w+)\]$/);
    if (arrayHeader) {
      if (arrayHeader[1] === 'args') {
        if (currentArg) out.args.push(currentArg);
        currentArg = { name: '' };
      }
      section = arrayHeader[1];
      continue;
    }
    if (header) {
      if (currentArg) { out.args.push(currentArg); currentArg = null; }
      section = header[1];
      continue;
    }
    const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim().replace(/^"(.*)"$/, '$1');
    if (section === 'skill') {
      if (key === 'name') out.name = val;
      if (key === 'version') out.version = val;
      if (key === 'description') out.description = val;
    } else if (section === 'dispatch') {
      if (key === 'type') out.dispatchType = val;
      if (key === 'server') out.dispatchServer = val;
      if (key === 'command') out.dispatchCommand = val;
    } else if (section === 'command') {
      if (key === 'name') out.commandName = val;
    } else if (section === 'args' && currentArg) {
      if (key === 'name') currentArg.name = val;
      else if (key === 'prompt') currentArg.prompt = val;
      else if (key === 'required') currentArg.required = val === 'true';
    } else if (section === 'catalog' && key === 'tags') {
      out.tags = (rawVal.match(/\[(.+)\]/)?.[1] ?? '')
        .split(',').map(t => t.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
    }
  }
  if (currentArg) out.args.push(currentArg);
  return out;
}

describe('.codex/skills/*/skill.toml manifests', () => {
  it('skills directory exists and has at least 4 skills', async () => {
    expect(existsSync(SKILLS_DIR)).toBe(true);
    const entries = await readdir(SKILLS_DIR);
    const skillDirs = [];
    for (const e of entries) {
      const s = await stat(join(SKILLS_DIR, e));
      if (s.isDirectory()) skillDirs.push(e);
    }
    expect(skillDirs.length).toBeGreaterThanOrEqual(4);
  });

  it('every skill has both skill.toml and README.md', async () => {
    const entries = await readdir(SKILLS_DIR);
    for (const e of entries) {
      const dir = join(SKILLS_DIR, e);
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
      expect(existsSync(join(dir, 'skill.toml'))).toBe(true);
      expect(existsSync(join(dir, 'README.md'))).toBe(true);
    }
  });

  it('every skill.toml has required fields and a parseable dispatch', async () => {
    const entries = await readdir(SKILLS_DIR);
    for (const e of entries) {
      const path = join(SKILLS_DIR, e, 'skill.toml');
      if (!existsSync(path)) continue;
      const raw = await readFile(path, 'utf-8');
      const skill = parseSkillToml(raw);
      expect(skill.name, `${e}: missing [skill].name`).toBeTruthy();
      expect(skill.version, `${e}: missing [skill].version`).toBeTruthy();
      expect(skill.description, `${e}: missing [skill].description`).toBeTruthy();
      // iter 142: two dispatch shapes are valid —
      //   mcp_tool → needs a [dispatch].server (wraps the MCP server)
      //   shell    → needs a [dispatch].command (runs a published npx wrapper,
      //              e.g. example-harness → `npx @metaharness/<pkg>`)
      expect(['mcp_tool', 'shell'], `${e}: [dispatch].type must be mcp_tool or shell`).toContain(skill.dispatchType);
      if (skill.dispatchType === 'mcp_tool') {
        expect(skill.dispatchServer, `${e}: mcp_tool dispatch missing [dispatch].server`).toBeTruthy();
      } else {
        expect(skill.dispatchCommand, `${e}: shell dispatch missing [dispatch].command`).toBeTruthy();
      }
      expect(skill.commandName, `${e}: missing [command].name`).toBeTruthy();
      // Skill name must equal directory name + command name
      expect(skill.name, `${e}: dir name must match [skill].name`).toBe(e);
      expect(skill.commandName, `${e}: command name must match [skill].name`).toBe(skill.name);
    }
  });

  it('skills with [[args]] have at least name + prompt per arg', async () => {
    const entries = await readdir(SKILLS_DIR);
    for (const e of entries) {
      const path = join(SKILLS_DIR, e, 'skill.toml');
      if (!existsSync(path)) continue;
      const raw = await readFile(path, 'utf-8');
      const skill = parseSkillToml(raw);
      for (const arg of skill.args) {
        expect(arg.name, `${e}: arg missing name`).toBeTruthy();
        expect(arg.prompt, `${e}: arg ${arg.name} missing prompt`).toBeTruthy();
      }
    }
  });

  it('create-harness host choices match HOSTS exactly', async () => {
    const raw = await readFile(join(SKILLS_DIR, 'create-harness', 'skill.toml'), 'utf-8');
    // The parser drops the choices list, so read it directly. Compared as a
    // *set against the source of truth* — the old regex only required 6
    // substrings in order and stayed green while the roster grew to 10.
    const choices = raw.match(/name = "host"[\s\S]*?choices = \[(.*?)\]/)?.[1];
    expect(choices, 'skill.toml host arg has no choices list').toBeTruthy();
    const listed = Array.from(choices!.matchAll(/"([^"]+)"/g), m => m[1]);
    expect(listed).toEqual([...HOSTS]);
  });

  it('create-harness template choices match the catalog exactly', async () => {
    const raw = await readFile(join(SKILLS_DIR, 'create-harness', 'skill.toml'), 'utf-8');
    const choices = raw.match(/name = "template"[\s\S]*?choices = \[(.*?)\]/)?.[1];
    expect(choices, 'skill.toml template arg has no choices list').toBeTruthy();
    const listed = Array.from(choices!.matchAll(/"([^"]+)"/g), m => m[1]);
    const catalogIds = CATALOG.map(t => t.id);
    expect(listed).toEqual(catalogIds);
    // `eject-from-ruflo` is a manifest *label* the eject pipeline writes
    // (eject.ts), never a selectable template — it must not appear here.
    expect(listed).not.toContain('eject-from-ruflo');
  });

  it('the 4 new skills (create/publish/validate/harness-secrets) are present', async () => {
    const skills = await readdir(SKILLS_DIR);
    expect(skills).toContain('create-harness');
    expect(skills).toContain('publish-harness');
    expect(skills).toContain('validate-harness');
    expect(skills).toContain('harness-secrets');
  });

  // iter 70 — every harness-lifecycle skill that exists on disk now,
  // pinned so dropping one is visible in code review.
  it('all 7 codex skills are present (iter 70: + diag-harness)', async () => {
    const skills = await readdir(SKILLS_DIR);
    const expected = [
      'create-harness',      // iter 22
      'publish-harness',     // iter 22
      'validate-harness',    // iter 22
      'harness-secrets',     // iter 22
      'verify-witness',      // iter 28
      'upgrade-harness',     // iter 49
      'diag-harness',        // iter 70
    ];
    for (const s of expected) {
      expect(skills, `missing skill dir: ${s}`).toContain(s);
    }
  });
});
