// SPDX-License-Identifier: MIT
//
// Unit 4 (tasks 4.6, 4.7, 4.8) — headless onboarding behaviour.
//
// The three properties here are the ones the spec names, and each is asserted
// against real output rather than against an internal function:
//
//   4.6 determinism        two runs, same config, different dirs -> identical trees
//   4.7 missing key        named residual report + non-zero exit (no silent pass)
//   4.8 conditional section a false section is removed *with its heading*,
//                          a true one is kept intact -- no orphaned markers
//
// Plus the unit-level guards for the pieces those properties rest on
// (`parseAnswers` validation, `substituteIcm` semantics, `scanResiduals`
// line numbers) and one cross-check that pins task 4.1's single-source rule:
// the question set advertised in `catalog.json` equals the set the emitted tree
// actually needs.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, sep } from 'node:path';
import { scaffold, loadCatalog } from '../src/index.js';
import {
  AnswersConfigError,
  parseAnswers,
  requiredQuestions,
  scanResiduals,
  substituteIcm,
} from '../src/onboarding.js';

const TEMPLATE = 'vertical:coding';
const BIN = join(__dirname, '..', 'dist', 'bin.js');

// The committed sample (task 4.5). Using it here means the file that ships as
// the documentation example is proven to load, validate, and resolve a tree —
// a sample that rotted would fail this suite rather than a reader's first run.
const SAMPLE = join(__dirname, '..', '..', '..', 'examples', 'icm-onboarding', 'answers.example.json');

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

/** `generated_at` is a wall clock stamp, not content (task 4.6 excludes it). */
const maskTimestamp = (s: string) =>
  s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at": "MASKED"');

async function scaffoldInto(
  suffix: string,
  answers?: Record<string, string | boolean>,
): Promise<string> {
  const target = join(await mkdtemp(join(tmpdir(), `onboarding-${suffix}-`)), 'demo-harness');
  await scaffold({
    name: 'demo-harness',
    template: TEMPLATE,
    host: 'claude-code',
    description: 'demo harness',
    targetDir: target,
    generatorVersion: 'test',
    icm: true,
    answers,
  });
  return target;
}

/** Every file's content, keyed by posix-relative path. */
async function readTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of (await walkFiles(root)).map(toPosix)) {
    out[rel] = await readFile(join(root, ...rel.split('/')), 'utf-8');
  }
  return out;
}

const COMPLETE: Record<string, string | boolean> = {
  PROJECT_GOAL: 'Demonstrate headless onboarding',
  BUILD_COMMAND: 'npm run build',
  TEST_COMMAND: 'npm test',
  REVIEW_FOCUS: 'Correctness and reuse',
  SUBAGENT_HANDOFF: true,
  FIX_LOOP: true,
};

describe('4.6 — determinism: same config, same tree', () => {
  it('two runs in two different temp dirs produce byte-identical trees', async () => {
    const a = await readTree(await scaffoldInto('det-a', COMPLETE));
    const b = await readTree(await scaffoldInto('det-b', COMPLETE));

    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const path of Object.keys(a)) {
      // Only the manifest's wall-clock stamp may differ. `manifest.sha256` is
      // derived from it, so it inherits the same single difference.
      const isStamp = path === '.harness/manifest.json' || path === '.harness/manifest.sha256';
      if (isStamp) continue;
      expect(b[path], `${path} differs between two identical runs`).toBe(a[path]);
    }
    expect(maskTimestamp(b['.harness/manifest.json']!)).toBe(
      maskTimestamp(a['.harness/manifest.json']!),
    );
  });

  it('the committed sample config loads and resolves the whole tree', async () => {
    // Task 4.5's file, used as the input: proves the shipped example is valid.
    const answers = parseAnswers(await readFile(SAMPLE, 'utf-8'), SAMPLE);
    const target = await scaffoldInto('sample', answers);

    const files = (await walkFiles(target)).map(toPosix);
    for (const path of files) {
      const content = await readFile(join(target, ...path.split('/')), 'utf-8');
      expect(content, `${path} still carries an ICM token`).not.toMatch(/\{\{[?/]?\s*[A-Z]/);
    }
  });

  it('output contains no absolute temp path (tree is portable across machines)', async () => {
    const target = await scaffoldInto('portable', COMPLETE);
    const root = target.slice(0, target.lastIndexOf(`${sep}demo-harness`));
    for (const [path, content] of Object.entries(await readTree(target))) {
      expect(content, `${path} embeds the temp dir`).not.toContain(root);
    }
  });
});

describe('4.7 — a config missing a required key is named, not silently accepted', () => {
  const incomplete = {
    PROJECT_GOAL: 'g',
    BUILD_COMMAND: 'b',
    SUBAGENT_HANDOFF: true,
    FIX_LOOP: true,
  };

  it('reports exactly the missing keys by name, with file:line', async () => {
    const target = await scaffoldInto('missing', incomplete);
    const r = await scaffold({
      name: 'demo-harness',
      template: TEMPLATE,
      host: 'claude-code',
      description: 'd',
      targetDir: join(await mkdtemp(join(tmpdir(), 'onboarding-missing2-')), 'h'),
      generatorVersion: 'test',
      icm: true,
      answers: incomplete,
    });

    const ob = r.onboarding!;
    expect(ob.mode).toBe('headless');
    expect(ob.residuals.map((x) => x.name).sort()).toEqual(['REVIEW_FOCUS', 'TEST_COMMAND']);
    for (const res of ob.residuals) {
      expect(res.file).toMatch(/stages\/0[34]-\w+\/CONTEXT\.md$/);
      expect(res.line).toBeGreaterThan(0);
    }
    // The answered half is still reported as resolved, so the report reads as a
    // diagnosis rather than a bare failure.
    expect(ob.resolved).toEqual(['BUILD_COMMAND', 'FIX_LOOP', 'PROJECT_GOAL', 'SUBAGENT_HANDOFF']);
    // And the unanswered placeholders are left in place, not blanked out.
    const stage = await readFile(join(target, 'stages', '03-test', 'CONTEXT.md'), 'utf-8');
    expect(stage).toContain('{{TEST_COMMAND}}');
  });

  it('the CLI exits non-zero and prints the named report on stderr', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onboarding-exit-'));
    const cfg = join(dir, 'partial.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cfg, JSON.stringify(incomplete));

    const r = spawnSync(
      process.execPath,
      [BIN, 'scaffold', 'demo', '--template', TEMPLATE, '--answers', cfg, '--target', join(dir, 'out')],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('TEST_COMMAND');
    expect(r.stderr).toContain('REVIEW_FOCUS');
    // Named, with a location — not a stack trace.
    expect(r.stderr).toMatch(/stages\/03-test\/CONTEXT\.md:\d+/);
    expect(r.stderr).not.toMatch(/\bat \w+.*\(.*:\d+:\d+\)/);
  });

  it('a complete config exits 0 and reports no residue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onboarding-ok-'));
    const cfg = join(dir, 'full.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cfg, JSON.stringify(COMPLETE));

    const r = spawnSync(
      process.execPath,
      [BIN, 'scaffold', 'demo', '--template', TEMPLATE, '--answers', cfg, '--target', join(dir, 'out')],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('All ICM placeholders resolved.');
  });

  it('--icm without a config still reports the residue rather than leaving it silent (task 4.4)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onboarding-interactive-'));
    const r = spawnSync(
      process.execPath,
      [BIN, 'scaffold', 'demo', '--template', TEMPLATE, '--icm', '--target', join(dir, 'out')],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // Interactive is the documented path, so this is NOT a failure...
    expect(r.status).toBe(0);
    // ...but it must not be quiet about the placeholders it left behind.
    expect(r.stdout).toContain('interactive');
    for (const name of [
      'PROJECT_GOAL',
      'BUILD_COMMAND',
      'TEST_COMMAND',
      'REVIEW_FOCUS',
      '?SUBAGENT_HANDOFF',
      '?FIX_LOOP',
    ]) {
      expect(r.stdout, `${name} not reported`).toContain(name);
    }
  });
});

describe('4.8 — conditional sections: whole-section semantics in both directions', () => {
  it('false removes the section with its heading and body', async () => {
    const on = await readTree(await scaffoldInto('cond-off', { ...COMPLETE, FIX_LOOP: false }));
    const test = on['stages/03-test/CONTEXT.md']!;

    // Nothing of the section survives — heading, table, or prose.
    expect(test).not.toContain('Fix Loop');
    expect(test).not.toContain('Suite red');
    expect(test).not.toMatch(/\{\{/);
    // The next section follows with exactly one blank line, so removal left no
    // doubled gap and no orphaned marker.
    expect(test).toContain('\n\n## Audit\n');
    expect(test).not.toMatch(/\n{3,}/);
    // And the following section's own table is intact.
    expect(test).toContain('| Suite green | The test command exits zero |');
  });

  it('true keeps the section intact, markers stripped', async () => {
    const on = await readTree(await scaffoldInto('cond-on', { ...COMPLETE, FIX_LOOP: true }));
    const test = on['stages/03-test/CONTEXT.md']!;

    expect(test).not.toMatch(/\{\{/);
    expect(test).toContain('## Fix Loop');
    expect(test).toContain('| Suite red |');
    expect(test).toContain('\n\n## Fix Loop\n');
    expect(test).not.toMatch(/\n{3,}/);
  });

  it('an unset-but-needed conditional is reported, not silently removed', async () => {
    // Omitting the key entirely must not read as "false" — that would silently
    // drop a section the author never decided about.
    const { SUBAGENT_HANDOFF: _omitted, ...rest } = COMPLETE;
    const target = await scaffoldInto('cond-unset', rest);
    const r = await scaffold({
      name: 'demo-harness',
      template: TEMPLATE,
      host: 'claude-code',
      description: 'd',
      targetDir: join(await mkdtemp(join(tmpdir(), 'onboarding-unset-')), 'h'),
      generatorVersion: 'test',
      icm: true,
      answers: rest,
    });
    expect(r.onboarding!.residuals.map((x) => x.name)).toContain('?SUBAGENT_HANDOFF');
    const plan = await readFile(join(target, 'stages', '01-plan', 'CONTEXT.md'), 'utf-8');
    expect(plan).toContain('{{?SUBAGENT_HANDOFF}}');
  });
});

describe('onboarding unit guards', () => {
  it('parseAnswers accepts full-line // comments and rejects malformed shapes by name', () => {
    expect(
      parseAnswers(`
        // a comment
        {
          // another
          "PROJECT_GOAL": "g",
          "FIX_LOOP": false
        }
      `),
    ).toEqual({ PROJECT_GOAL: 'g', FIX_LOOP: false });

    const bad: Array<[string, RegExp]> = [
      ['{"goal": "x"}', /not a question id/],
      ['{"PROJECT_GOAL": ""}', /empty/],
      ['{"PROJECT_GOAL": 3}', /must be a string or boolean/],
      ['{"PROJECT_GOAL": ["a"]}', /must be a string or boolean/],
      ['[]', /must be a JSON object/],
      ['{oops}', /not valid JSON/],
    ];
    for (const [raw, re] of bad) {
      expect(() => parseAnswers(raw), raw).toThrow(AnswersConfigError);
      expect(() => parseAnswers(raw), raw).toThrow(re);
    }
  });

  it('a trailing // in a string value is NOT stripped (no escape-state guessing)', () => {
    const v = parseAnswers('{"PROJECT_GOAL": "see https://example.com/x"}');
    expect(v.PROJECT_GOAL).toBe('see https://example.com/x');
  });

  it('substituteIcm leaves lowercase mustache vars alone (the renderer own half)', () => {
    const r = substituteIcm('hi {{name}}, goal {{PROJECT_GOAL}}', { PROJECT_GOAL: 'g' });
    expect(r.content).toBe('hi {{name}}, goal g');
    expect(r.unresolved).toEqual([]);
  });

  it('scanResiduals reports every token with its true line number', () => {
    const r = scanResiduals('a\n{{PROJECT_GOAL}}\nb\n{{?FIX_LOOP}}\n');
    expect(r).toEqual([
      { name: 'PROJECT_GOAL', line: 2 },
      { name: '?FIX_LOOP', line: 4 },
    ]);
  });

  it('nested conditionals are rejected explicitly rather than guessed at', () => {
    expect(() =>
      substituteIcm('{{?A}}\n{{?B}}\nx\n{{/B}}\n{{/A}}', { A: true, B: true }),
    ).toThrow(/nested conditional/);
  });

  it('catalog.json advertises exactly the questions the emitted tree needs (task 4.1)', async () => {
    // The single-source rule: the CLI-visible question list and the derived set
    // cannot disagree. Compared at runtime, so adding a placeholder to a stage
    // contract without adding metadata (or vice versa) fails here.
    //
    // Derived from an INTERACTIVE scaffold (no answers), which is the tree with
    // its tokens intact — a resolved tree has none left to derive from.
    const target = await scaffoldInto('catalog');
    const derived = requiredQuestions(await readTree(target));
    const advertised = loadCatalog()
      .find((t) => t.id === TEMPLATE)!
      .icm!.questions!.map((q) => q.id)
      .sort();
    expect(derived.length).toBeGreaterThan(0);
    expect(advertised).toEqual(derived);
    expect(advertised).toEqual(Object.keys(COMPLETE).sort());
  });
});
