// SPDX-License-Identifier: MIT
//
// Seam driver tests (Unit 5, tasks 5.7, 5.8, 5.11, 5.13). ADR-282.
//
// Fixture-driven on purpose: the three transcript tails are committed strings,
// so the failure semantics are asserted deterministically with no live model
// call and no network. The fixtures are the *pinned field shape* (task 5.11 /
// OQ3) — the names below were re-verified against Claude Code 2.1.265, where the
// typed exit arrives as `structured_output` on the terminal `result` event.

import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STAGE_EXIT_SCHEMA,
  assertNoBare,
  buildInvocation,
  buildSidecar,
  collectPermissionDenials,
  composePrompt,
  decideOutcome,
  formatDenialReport,
  makeRunId,
  outputsHonored,
  parseStreamJsonTranscript,
  parseStageInputs,
  readStageContract,
  readStageExit,
  resolveStageDir,
  resolveStageInputs,
  runSeam,
  type InvocationRecord,
  type Observation,
} from '../src/seam-driver.js';
import { DEFAULT_AGENT_ID, buildLedgerRow, runLocalLedgerPath } from '../src/seam-ledger.js';

/** A `result` event carrying a valid typed exit (the pinned shape). */
const VALID_EXIT = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 'sess-abc123',
  structured_output: {
    status: 'done',
    artifacts: ['01-plan-example-plan.md'],
    summary: 'plan written',
  },
  permission_denials: [],
};

function transcript(...events: unknown[]): string {
  return `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
}

/** Fixture 1 — a valid structured exit. */
const TAIL_VALID = transcript(
  { type: 'system', subtype: 'init', session_id: 'sess-abc123' },
  { type: 'assistant', message: { content: 'planning' } },
  VALID_EXIT,
);

/** Fixture 2 — malformed: the run ended, but the typed exit is junk. */
const TAIL_MALFORMED = transcript(
  { type: 'system', subtype: 'init', session_id: 'sess-abc123' },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'sess-abc123',
    structured_output: '{"status": 42, "artifacts": "not-an-array"}',
  },
);

/** Fixture 3 — absent: no result event at all (a silent run). */
const TAIL_ABSENT = transcript({ type: 'system', subtype: 'init', session_id: 'sess-abc123' });

function observe(raw: string, invocation: InvocationRecord): Observation {
  const parsed = parseStreamJsonTranscript(raw);
  return { invocation, resultEvents: parsed.resultEvents, tail: raw };
}

const OPTS = { dir: '/tmp/harness-under-test' };

describe('seam-driver: pinned structured exit (task 5.11 / OQ3)', () => {
  it('pins the documented --json-schema option and the typed field shape', () => {
    const inv = buildInvocation(OPTS);
    const i = inv.args.indexOf('--json-schema');
    expect(i).toBeGreaterThanOrEqual(0);
    const schema = JSON.parse(inv.args[i + 1] as string) as unknown;
    expect(schema).toEqual(STAGE_EXIT_SCHEMA);
    // A typed exit replaces tail-scraping: `status` is required.
    expect((schema as { required?: string[] }).required).toEqual(['status']);
  });

  it('reads the typed exit off the terminal result event', () => {
    const parsed = parseStreamJsonTranscript(TAIL_VALID);
    const exit = readStageExit(parsed.resultEvents[parsed.resultEvents.length - 1]!);
    expect(exit).toEqual({
      status: 'done',
      artifacts: ['01-plan-example-plan.md'],
      summary: 'plan written',
    });
    expect(parsed.sessionId).toBe('sess-abc123');
  });

  it('does not scrape prose from the transcript tail', () => {
    // A tail that mentions done/complete in prose but carries no typed exit
    // must NOT be read as a success.
    const prose = transcript({
      type: 'result',
      session_id: 's1',
      result: 'STAGE_EXIT: done. All checks pass.',
    });
    const parsed = parseStreamJsonTranscript(prose);
    expect(readStageExit(parsed.resultEvents[0]!)).toBeNull();
    expect(decideOutcome(observe(prose, buildInvocation(OPTS))).outcome).not.toBe('done');
  });
});

describe('seam-driver: named failure semantics (task 5.7)', () => {
  it('valid structured exit -> done', () => {
    const d = decideOutcome(observe(TAIL_VALID, buildInvocation(OPTS)));
    expect(d.outcome).toBe('done');
    expect(d.stageExit?.status).toBe('done');
  });

  it('malformed tail -> corrective-retry', () => {
    const d = decideOutcome(observe(TAIL_MALFORMED, buildInvocation(OPTS)));
    expect(d.outcome).toBe('corrective-retry');
    expect(d.stageExit).toBeNull();
  });

  it('absent tail -> needs-review (silence is a named state, not a failure)', () => {
    const d = decideOutcome(observe(TAIL_ABSENT, buildInvocation(OPTS)));
    expect(d.outcome).toBe('needs-review');
  });

  it('recovers on the single corrective re-invoke, on the same session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');

    const seen: InvocationRecord[] = [];
    const run = await runSeam({ dir }, async (inv, prompt) => {
      seen.push(inv);
      expect(prompt).toContain('# Stage 01');
      return seen.length === 1
        ? { raw: TAIL_MALFORMED, code: 0 }
        : { raw: TAIL_VALID, code: 0 };
    });

    expect(seen).toHaveLength(2);
    expect(run.outcome).toBe('done');
    // The retry resumes the SAME bridge session (unit FR).
    expect(seen[1]!.args).toContain('--resume');
    expect(seen[1]!.args[seen[1]!.args.indexOf('--resume') + 1]).toBe('sess-abc123');
  });

  it('never re-invokes more than once — a second failure is needs-review', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');

    let calls = 0;
    const run = await runSeam({ dir }, async () => {
      calls += 1;
      return { raw: TAIL_MALFORMED, code: 0 };
    });
    expect(calls).toBe(2); // one invocation + exactly one corrective retry
    expect(run.outcome).toBe('needs-review');
    expect(run.status).toBe('needs-review');
  });
});

describe('seam-driver: liveness rules as regression guards (tasks 5.8, 5.13)', () => {
  it('never passes a timeout parameter, on any invocation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');

    const records: InvocationRecord[] = [];
    const run = await runSeam({ dir }, async (inv) => {
      records.push(inv);
      return { raw: TAIL_MALFORMED, code: 0 };
    });
    records.push(run.invocation);
    if (run.correctiveInvocation) records.push(run.correctiveInvocation);

    for (const inv of records) {
      expect(inv.timeoutPassed).toBe(false);
      // Guard both the flag form and any `timeout=` style argument.
      const joined = inv.args.join(' ');
      expect(joined).not.toMatch(/--timeout|timeout=|--max-time/);
      expect(inv).not.toHaveProperty('timeout');
      expect(inv).not.toHaveProperty('task_timeout');
    }
  });

  it('grants writes only on explicit opt-in, and records the decision', () => {
    const denied = buildInvocation(OPTS);
    expect(denied.writesGranted).toBe(false);
    expect(denied.args).not.toContain('--permission-mode');
    expect(denied.args).not.toContain('--allow-dangerously-skip-permissions');

    const granted = buildInvocation({ ...OPTS, allowWrites: true });
    expect(granted.writesGranted).toBe(true);
    expect(granted.args[granted.args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
    // The grant never smuggles a blanket bypass.
    expect(granted.args).not.toContain('--allow-dangerously-skip-permissions');
  });

  it('never passes --bare for a harness run (task 5.13)', () => {
    expect(buildInvocation(OPTS).barePassed).toBe(false);
    expect(() => assertNoBare(['-p', '--bare'])).toThrow(/--bare/);
    // And the invocation builder refuses even if a caller smuggles it in.
    const inv = buildInvocation({ ...OPTS });
    expect(inv.args).not.toContain('--bare');
    expect(() => assertNoBare(inv.args)).not.toThrow();
  });
});

describe('seam-driver: permission denials are data, not swallowed (task 5.12)', () => {
  const DENY_TRANSCRIPT = transcript(
    { type: 'system', subtype: 'init', session_id: 'sess-d1' },
    {
      ...VALID_EXIT,
      session_id: 'sess-d1',
      permission_denials: [{ tool_name: 'Write', tool_use_id: 'tu_1' }],
    },
  );

  it('collects the denial tool/scope and surfaces it as a named output', () => {
    const parsed = parseStreamJsonTranscript(DENY_TRANSCRIPT);
    const denials = collectPermissionDenials(parsed.resultEvents);
    expect(denials).toEqual([{ tool_name: 'Write', tool_use_id: 'tu_1' }]);
    const report = formatDenialReport(denials, '01');
    expect(report.join('\n')).toContain('Write');
    expect(report.join('\n')).toMatch(/not swallowed|held/i);
  });

  it('records only the denial tool/scope — no credential material', () => {
    const parsed = parseStreamJsonTranscript(DENY_TRANSCRIPT);
    const sidecar = buildSidecar({
      runId: 'r1',
      stage: '01',
      status: 'done',
      outputs: [],
      sessionId: 'sess-d1',
      denials: collectPermissionDenials(parsed.resultEvents),
    });
    const json = JSON.stringify(sidecar);
    expect(json).toContain('Write');
    expect(json).not.toMatch(/token|secret|api[_-]?key|password|bearer/i);
    // The denial is surfaced even though the stage exited cleanly.
    expect(sidecar.status).toBe('done');
    expect((sidecar.permission_denials as unknown[]).length).toBe(1);
  });

  it('a clean run reports no denial', () => {
    const denials = collectPermissionDenials(parseStreamJsonTranscript(TAIL_VALID).resultEvents);
    expect(denials).toEqual([]);
    expect(formatDenialReport(denials, '01')).toEqual([]);
  });
});

describe('seam-driver: sidecar + ledger mapping without a schema change (tasks 5.4, 5.5)', () => {
  it('records stage/status/outputs outside the ledger schema', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');
    await writeFile(join(dir, 'stages', '01', 'output', 'example-plan.md'), 'plan\n', 'utf-8');

    const run = await runSeam({ dir }, async () => ({ raw: TAIL_VALID, code: 0 }));
    const sidecar = JSON.parse(
      await (await import('node:fs/promises')).readFile(run.sidecarPath, 'utf-8'),
    ) as Record<string, unknown>;

    expect(sidecar.stage).toBe('01');
    expect(sidecar.status).toBe('done');
    // The contract's Outputs section is honored end to end (modulo the run id).
    expect(sidecar.outputs).toEqual(['example-plan.md']);
    expect(outputsHonored(run, ['example-plan.md'])).toBe(true);
  });

  it('maps to exactly the existing columns — no migration, no new column', () => {
    const row = buildLedgerRow({
      runId: '20260913-101112-0001',
      sessionId: 'sess-abc123',
      contractPath: '/h/stages/01/CONTEXT.md',
      dir: '/h',
      status: 'done',
    });
    expect(Object.keys(row).sort()).toEqual(
      [
        'agent_id',
        'claude_session_id',
        'cwd',
        'last_state',
        'pending_result',
        'prompt',
        'task_id',
        'timeout_min',
      ].sort(),
    );
    // Stage lands in the sidecar; the row's status matches the sidecar.
    expect(row.last_state).toBe('done');
    // `0` is the no-timer sentinel — a row must not claim the default 30m timer.
    expect(row.timeout_min).toBe(0);
    expect(row.pending_result).toBe(0);
    // The default agent id names the driver, not any particular operator
    // identity — this repo is public, so no personal identity is baked in.
    expect(row.agent_id).toBe(DEFAULT_AGENT_ID);
    expect(row.agent_id).toBe('seam');
  });

  it('writes the run-local ledger, never the operator bridge ledger (ADR-282 D2)', async () => {
    // The bridge's live ledger resolves into an operator home directory. A seam
    // run is a test of the seam, so its rows must not land in live operational
    // state — three runs did exactly that before this guard existed.
    const dir = await mkdtemp(join(tmpdir(), 'seam-ledger-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');

    const run = await runSeam({ dir }, async () => ({ raw: TAIL_VALID, code: 0 }));
    const dbPath = runLocalLedgerPath(run.runDir);

    // Containment: the db lives inside the run directory, so it is disposable
    // with the run and can never be the operator's ledger.
    expect(dbPath.startsWith(run.runDir)).toBe(true);
    expect(dbPath).toContain(join('runs', run.runId));
    // A home-directory ledger path could never be the run-local one.
    expect(dbPath.startsWith(homedir())).toBe(false);
  });

  it('keeps the raw transcript as the run\'s proof artifact (task 5.10)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-transcript-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');

    // A transcript whose text carries a marker no other file would contain: the
    // claim under test is that the transcript is preserved verbatim, and a
    // test that only checked for a non-empty file would pass on any stray write.
    const marked = `${TAIL_VALID}\n{"type":"system","subtype":"hook","note":"TRANSCRIPT-MARKER-7f3a"}\n`;
    const run = await runSeam({ dir }, async () => ({ raw: marked, code: 0 }));
    const saved = await readFile(run.transcriptPath, 'utf-8');

    expect(run.transcriptPath.startsWith(run.runDir)).toBe(true);
    expect(saved).toBe(marked);
    // The typed exit is still read from the transcript it was written beside.
    expect(run.stageExit?.status).toBe('done');
  });

  it('keeps the composed prompt, because the transcript cannot prove the input (task 5.10)', async () => {
    // The seam's central claim is "the emitted contract is the consumed input".
    // `stream-json` does NOT echo the prompt — the CLI emits the model's output
    // stream only — so a run holding just a transcript can show what the stage
    // said and never what it was fed. The prompt is saved for that reason.
    const dir = await mkdtemp(join(tmpdir(), 'seam-prompt-'));
    await mkdir(join(dir, 'stages', '01', 'output'), { recursive: true });
    await mkdir(join(dir, 'references'), { recursive: true });
    await writeFile(join(dir, 'references', 'CONTEXT.md'), '# Conventions\nBe terse.\n', 'utf-8');
    // A contract with a distinctive line, and an Inputs table whose row names a
    // real file — so the proof must carry BOTH the contract and the resolution.
    const contract = [
      '# Stage 01: Plan',
      '',
      'CONTRACT-SENTINEL-9c1f turn a request into a plan.',
      '',
      '## Inputs',
      '',
      '| Source | Location | Scope |',
      '|--------|----------|-------|',
      '| Reference | `../../references/CONTEXT.md` | Full value |',
      '',
      '## Process',
      '',
      '1. Think.',
      '',
    ].join('\n');
    await writeFile(join(dir, 'stages', '01', 'CONTEXT.md'), contract, 'utf-8');

    const run = await runSeam({ dir, request: 'REQUEST-SENTINEL-77' }, async () => ({
      raw: TAIL_VALID,
      code: 0,
    }));
    const proof = await readFile(run.promptPath, 'utf-8');

    expect(run.promptPath.startsWith(run.runDir)).toBe(true);
    // The contract is fed VERBATIM — not a re-derived prompt (task 5.1).
    expect(proof).toContain('CONTRACT-SENTINEL-9c1f');
    expect(proof).toContain('# Stage 01: Plan');
    // The Inputs table was resolved against the tree (task 5.3), and the row's
    // scope selected the file's content.
    expect(proof).toContain('Resolved inputs');
    expect(proof).toContain('Be terse.');
    // The conversation row the table names.
    expect(proof).toContain('REQUEST-SENTINEL-77');
  });
});

describe('seam-driver: contract fed verbatim, scoped by its Inputs table (task 5.3)', () => {
  const CONTRACT = [
    '# Stage 01: Plan',
    '',
    '## Inputs',
    '',
    '| Source | File/Location | Section/Scope | Why |',
    '|--------|--------------|---------------|-----|',
    '| User | (conversation) | The requested change | The starting point |',
    '| Project | `the project goal` | Full value | Scope |',
    '| Reference | `../../references/CONTEXT.md` | "What to Load" | Conventions |',
    '',
    '## Process',
    '',
    '1. do the thing',
    '',
  ].join('\n');

  it('parses the Inputs table rows and drops the header/separator', () => {
    const rows = parseStageInputs(CONTRACT);
    expect(rows.map((r) => r.source)).toEqual(['User', 'Project', 'Reference']);
    expect(rows[2]).toEqual({
      source: 'Reference',
      location: '`../../references/CONTEXT.md`',
      scope: '"What to Load"',
    });
  });

  it('scopes a resolved file to the named section, not the whole file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01-plan'), { recursive: true });
    await mkdir(join(dir, 'references'), { recursive: true });
    await writeFile(join(dir, 'stages', '01-plan', 'CONTEXT.md'), CONTRACT, 'utf-8');
    await writeFile(
      join(dir, 'references', 'CONTEXT.md'),
      '# Refs\n\n## What to Load\n\n- _core/CONVENTIONS.md\n\n## Other\n\n- not this one\n',
      'utf-8',
    );

    const inputs = await resolveStageInputs(dir, '01', CONTRACT);
    const ref = inputs.find((i) => i.source === 'Reference')!;
    expect(ref.resolved).toBe(true);
    expect(ref.content).toContain('_core/CONVENTIONS.md');
    expect(ref.content).not.toContain('not this one');

    const prompt = composePrompt(CONTRACT, inputs);
    // The contract itself is fed verbatim — that IS the seam.
    expect(prompt.startsWith('# Stage 01: Plan')).toBe(true);
    expect(prompt).toContain('- _core/CONVENTIONS.md');
  });

  it('reports an unresolvable row instead of silently dropping it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01-plan'), { recursive: true });
    await writeFile(join(dir, 'stages', '01-plan', 'CONTEXT.md'), CONTRACT, 'utf-8');
    const inputs = await resolveStageInputs(dir, '01', CONTRACT);
    const ref = inputs.find((i) => i.source === 'Reference')!;
    expect(ref.resolved).toBe(false);
    expect(inputs).toHaveLength(3); // still reported, not dropped
  });

  it('feeds the contract alone when nothing resolves', () => {
    expect(composePrompt(CONTRACT, [])).toBe(CONTRACT);
  });
});

describe('seam-driver: stage id vs emitted dir (task 5.9 discovery)', () => {
  it('resolves the bare stage id to the catalog-emitted `<id>-<name>` dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01-plan', 'output'), { recursive: true });
    await mkdir(join(dir, 'stages', '02-implement', 'output'), { recursive: true });
    await writeFile(join(dir, 'stages', '01-plan', 'CONTEXT.md'), '# Stage 01\n', 'utf-8');
    await writeFile(join(dir, 'stages', '02-implement', 'CONTEXT.md'), '# Stage 02\n', 'utf-8');

    expect(await resolveStageDir(dir, '01')).toBe(join(dir, 'stages', '01-plan'));
    expect(await resolveStageDir(dir, '02')).toBe(join(dir, 'stages', '02-implement'));

    // And the contract is read from the resolved dir, not the bare id.
    const contract = await readStageContract(dir, '01');
    expect(contract).toContain('# Stage 01');
  });

  it('does not confuse a prefix id with a longer one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01-plan'), { recursive: true });
    await mkdir(join(dir, 'stages', '0100-other'), { recursive: true });
    expect(await resolveStageDir(dir, '01')).toBe(join(dir, 'stages', '01-plan'));
  });

  it('fails loudly on a missing stage rather than inventing a path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-driver-'));
    await mkdir(join(dir, 'stages', '01-plan'), { recursive: true });
    await expect(readStageContract(dir, '09')).rejects.toThrow(/no stage contract for stage 09/);
  });
});

describe('seam-driver: run id shape (queue-compatible)', () => {
  it('is second-resolution and sortable', () => {
    const a = makeRunId(new Date(2026, 8, 13, 10, 11, 12));
    const b = makeRunId(new Date(2026, 8, 13, 10, 11, 12));
    expect(a).toMatch(/^\d{8}-\d{6}-\d{4}$/);
    expect(a).toContain('20260913-101112');
    expect(a < b).toBe(true); // deterministic tiebreak
  });
});
