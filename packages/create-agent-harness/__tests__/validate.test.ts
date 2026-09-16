// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { validate } from '../src/validate.js';
import { runIcmStructure } from '../src/validate.js';

/**
 * Build an ICM scaffold directory: the emitted five-layer shape for the
 * catalog template `vertical:coding`, with a manifest that records both the
 * files (from which `icm-structure` reads *whether* a tree was emitted,
 * ADR-279 d3) and the template id (from which it reads whether the template
 * is ICM-*capable*, ADR-285 — the flag era's `--icm` marker is gone).
 */
async function makeIcmDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ahg-icm-test-'));
  const stageDirs = ['stages/01-plan', 'stages/02-implement', 'stages/03-test', 'stages/04-review'];
  const files: Record<string, string> = {
    'CONTEXT.md': '# workspace routing table\n',
    'references/CONTEXT.md': '# navigation\n',
  };
  for (const s of stageDirs) {
    files[`${s}/CONTEXT.md`] = '# stage contract\n\n{{PROJECT_GOAL}}\n{{?SUBAGENT_HANDOFF}}\nhandoff\n{{/SUBAGENT_HANDOFF}}\n';
    files[`${s}/output/.gitkeep`] = '';
  }
  for (const [p, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, p)), { recursive: true });
    await writeFile(join(dir, p), content);
  }
  await mkdir(join(dir, '.harness'), { recursive: true });
  await writeFile(join(dir, '.harness', 'manifest.json'), JSON.stringify({
    vars: { name: 'test-harness' },
    template: 'vertical:coding',
    files,
  }, null, 2));
  return dir;
}

async function makeHarnessDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ahg-validate-test-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'test-harness',
    version: '0.1.0',
    dependencies: { '@metaharness/kernel': '^0.1.0' },
  }, null, 2));
  await mkdir(join(dir, '.harness'), { recursive: true });
  await writeFile(join(dir, '.harness', 'manifest.json'), JSON.stringify({
    vars: { name: 'test-harness' }, files: {},
  }));
  // The sha256 of the manifest content above (no formatting) — same algo as
  // subcommands.ts:doctor: sha256 over the literal file bytes.
  const { createHash } = await import('node:crypto');
  const m = await import('node:fs/promises').then(m =>
    m.readFile(join(dir, '.harness', 'manifest.json'), 'utf-8')
  );
  const hash = createHash('sha256').update(m, 'utf-8').digest('hex');
  await writeFile(join(dir, '.harness', 'manifest.sha256'), hash);
  // At-least-one host artifact for doctor to pass.
  await writeFile(join(dir, 'AGENTS.md'), '# Pi-Dev agents\n');
  return dir;
}

describe('harness validate', () => {
  // iter 76 — diag is the new 6th check.
  it('chains diag as the 6th informational check (iter 76)', async () => {
    const dir = await makeHarnessDir();
    try {
      const r = await validate([dir, '--skip-gcp']);
      // diag is informational — surface SKIP / PASS / WARN but never
      // FAIL the umbrella. On a hand-rolled manifest with no meta block,
      // diag should SKIP (no kernel_version recorded).
      const txt = r.lines.join('\n');
      expect(txt).toMatch(/SKIP\s+diag\s+—\s+manifest pre-iter-58/);
      // Umbrella verdict unchanged — HEALTHY despite diag SKIP
      expect(txt).toMatch(/Result: HEALTHY/);
      expect(r.code).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runs all 5 checks and returns HEALTHY on a clean harness', async () => {
    const dir = await makeHarnessDir();
    try {
      const { code, lines } = await validate([dir, '--skip-gcp']);
      const txt = lines.join('\n');
      // Must mention all 5 checks
      expect(txt).toMatch(/doctor/);
      expect(txt).toMatch(/verify/);
      expect(txt).toMatch(/path-guard/);
      expect(txt).toMatch(/mcp/);
      expect(txt).toMatch(/secrets/);
      expect(code).toBe(0);
      expect(txt).toMatch(/Result: HEALTHY/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // iter 94 — symmetric with iter 93 doctor fix
  it('umbrella FAIL message recommends diag --bundle (iter 94)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ahg-val-fail-'));
    try {
      // Empty dir → doctor fails (no package.json, no .harness),
      // umbrella FAILs → must recommend the bundle.
      const r = await validate([dir, '--skip-gcp']);
      expect(r.code).toBe(1);
      const txt = r.lines.join('\n');
      expect(txt).toMatch(/Next:\s*capture the full diagnostic state/);
      expect(txt).toMatch(/harness diag .* --bundle > bundle\.json/);
      expect(txt).toContain('github.com/ruvnet/agent-harness-generator/issues');
      expect(txt).toMatch(/secret_\/token_\/key_\/password_ fields are redacted/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('HEALTHY result has no bundle suggestion noise (iter 94)', async () => {
    const dir = await makeHarnessDir();
    try {
      const r = await validate([dir, '--skip-gcp']);
      expect(r.code).toBe(0);
      const txt = r.lines.join('\n');
      expect(txt).toMatch(/Result: HEALTHY/);
      // Crucially: NO "Next:" block on HEALTHY runs
      expect(txt).not.toMatch(/Next:\s*capture/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns 1 and explains which check failed', async () => {
    // Empty dir → doctor fails (no package.json)
    const dir = await mkdtemp(join(tmpdir(), 'ahg-validate-empty-'));
    try {
      const { code, lines } = await validate([dir, '--skip-gcp']);
      expect(code).toBe(1);
      const txt = lines.join('\n');
      expect(txt).toMatch(/FAIL doctor/);
      expect(txt).toMatch(/Result: .* FAILED/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('path-guard catches a hardcoded /tmp/ in user TS files', async () => {
    const dir = await makeHarnessDir();
    await writeFile(join(dir, 'bad.ts'),
      `// SPDX-License-Identifier: MIT\nexport const path = '/tmp/agent-state.json';\n`);
    try {
      const { code, lines } = await validate([dir, '--skip-gcp']);
      const txt = lines.join('\n');
      expect(txt).toMatch(/FAIL path-guard/);
      expect(code).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips verify when no witness file is present', async () => {
    const dir = await makeHarnessDir();
    try {
      const { lines } = await validate([dir, '--skip-gcp']);
      expect(lines.join('\n')).toMatch(/PASS verify\s+— no witness/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('mcp check passes when no .mcp/servers.json exists', async () => {
    const dir = await makeHarnessDir();
    try {
      const { lines } = await validate([dir, '--skip-gcp']);
      expect(lines.join('\n')).toMatch(/PASS mcp\s+— no \.mcp/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('mcp check catches missing required fields', async () => {
    const dir = await makeHarnessDir();
    await mkdir(join(dir, '.mcp'), { recursive: true });
    await writeFile(join(dir, '.mcp', 'servers.json'),
      JSON.stringify({ mcpServers: [{ command: ['x'] }] }));
    try {
      const { lines, code } = await validate([dir, '--skip-gcp']);
      expect(lines.join('\n')).toMatch(/FAIL mcp\s+— server\[0\] missing name/);
      expect(code).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors --skip-gcp by skipping the secrets check', async () => {
    const dir = await makeHarnessDir();
    try {
      const { lines } = await validate([dir, '--skip-gcp']);
      expect(lines.join('\n')).toMatch(/PASS secrets\s+— skipped/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('icm-structure check (task 3.4)', () => {
  // ADR-285: the discriminator is template *capability*, not a flag. A manifest
  // naming no template at all is not ICM-capable (fail-closed) → SKIP.
  it('SKIPs a template that is not ICM-capable', async () => {
    const dir = await makeHarnessDir();
    try {
      const r = await runIcmStructure(dir);
      expect(r.tag).toBe('SKIP');
      expect(r.code).toBe(0);
      expect(r.detail).toMatch(/not ICM-capable/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Task 4.2: a capable template with no tree is the *unexpected* absence —
  // WARN (advisory, code 0), never FAIL, since a pre-removal harness lands here.
  it('WARNs when a capable template emitted no ICM tree, naming the template', async () => {
    const dir = await makeHarnessDir();
    try {
      const { readFile, writeFile } = await import('node:fs/promises');
      const p = join(dir, '.harness', 'manifest.json');
      const m = JSON.parse(await readFile(p, 'utf-8'));
      await writeFile(p, JSON.stringify({ ...m, template: 'vertical:coding' }, null, 2));
      const r = await runIcmStructure(dir);
      expect(r.tag).toBe('WARN');
      expect(r.code).toBe(0);
      expect(r.detail).toMatch(/vertical:coding/);
      expect(r.detail).toMatch(/capable but no ICM tree/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('PASSes the emitted five-layer shape and names residual placeholders', async () => {
    const dir = await makeIcmDir();
    try {
      const r = await runIcmStructure(dir);
      expect(r.tag).toBe('PASS');
      expect(r.code).toBe(0);
      expect(r.detail).toMatch(/4 stages/);
      expect(r.detail).toMatch(/PROJECT_GOAL/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('FAILs when a stage dir is missing, naming it', async () => {
    const dir = await makeIcmDir();
    try {
      await rm(join(dir, 'stages/03-test'), { recursive: true, force: true });
      const r = await runIcmStructure(dir);
      expect(r.code).toBe(1);
      expect(r.detail).toMatch(/stages\/03-test/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('FAILs when the stage set diverges from catalog.icm.stages', async () => {
    const dir = await makeIcmDir();
    try {
      await mkdir(join(dir, 'stages/05-extra/output'), { recursive: true });
      await writeFile(join(dir, 'stages/05-extra/CONTEXT.md'), '# stray\n');
      await writeFile(join(dir, 'stages/05-extra/output/.gitkeep'), '');
      const r = await runIcmStructure(dir);
      expect(r.code).toBe(1);
      expect(r.detail).toMatch(/stages\/05-extra/);
      expect(r.detail).toMatch(/catalog\.icm\.stages/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('FAILs on a per-stage references/ dir (amended FR: Layer 3 is workspace-level)', async () => {
    const dir = await makeIcmDir();
    try {
      await mkdir(join(dir, 'stages/01-plan/references'), { recursive: true });
      await writeFile(join(dir, 'stages/01-plan/references/CONTEXT.md'), '# ref\n');
      const r = await runIcmStructure(dir);
      expect(r.code).toBe(1);
      expect(r.detail).toMatch(/per-stage references/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('FAILs on a leaked lowercase Mustache var in a stage file', async () => {
    const dir = await makeIcmDir();
    try {
      await writeFile(
        join(dir, 'stages/01-plan/CONTEXT.md'),
        '# stage contract\n\n{{projectName}}\n',
      );
      const r = await runIcmStructure(dir);
      expect(r.code).toBe(1);
      expect(r.detail).toMatch(/\{\{projectName\}\}/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('FAILs when a stage file exceeds the line budget', async () => {
    const dir = await makeIcmDir();
    try {
      const filler = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
      await writeFile(join(dir, 'stages/01-plan/CONTEXT.md'), `${filler}\n`);
      const r = await runIcmStructure(dir);
      expect(r.code).toBe(1);
      expect(r.detail).toMatch(/budget 80/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
