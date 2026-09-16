// SPDX-License-Identifier: MIT
//
// Seam driver (Unit 5, tasks 5.1–5.13). ADR-282.
//
// THE SEAM (task 5.1): the emitted harness is consumed as the pipeline's
// *input* — the stage contract (`stages/01-plan/CONTEXT.md`) is what the driver
// feeds to the harness, not a re-derived prompt. If this sentence stops being
// true, the seam has moved and this file is wrong.
//
// Validated against Claude Code CLI **2.1.265** (`claude --version`). Re-check
// on CLI upgrade: `--bare` skips discovery of `CLAUDE.md`, `.claude/`, skills
// and subagents — precisely the content an ICM harness *is* — and the CLI is
// documented as moving toward making it the default, so a silent flip would
// make harness runs load nothing while still appearing to succeed. That is why
// `assertNoBare` below is a hard throw and a test asserts it (task 5.13).
//
// Deliberate deviation (spec §Architectural deviations): the stage exit is read
// from the CLI's structured-output option (`--json-schema`), which returns a
// typed `structured_output` field on the terminal `result` event, rather than
// scraping a `STAGE_EXIT:` line out of the transcript tail. The tail-scrape is
// deliberately NOT retained as a fallback — it would be dead code (OQ4).
//
// No timers, ever (unit FR): no timeout parameter is ever passed to the
// invocation. Liveness replaces timers, and the invocation record is asserted
// to carry no timeout key (task 5.8). Silence is a *named state*, never a
// failure trigger — a silent run is polled, not killed.
//
// Reuse note (task 5.2, deviation D1): the spec asks to reuse
// `result_parser.py` and the `claude_bridge` ledger module. Both are Python and
// live in the operator workspace, not in this repository (verified: zero
// references anywhere in the tree). Adding a Python runtime + workspace
// dependency to this TS package would be a new cross-language surface in 3-OS
// CI (where `node:sqlite` — the only SQLite with no new dependency — does not
// exist on Node 20). The *contracts* are reused instead: stream-json is parsed
// here with the same event vocabulary, and the ledger row is written through
// the ledger's own public API so the schema is never duplicated. See ADR-282.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

/** Failure semantics over the transcript tail (unit FR / task 5.6). */
export type SeamOutcome = 'done' | 'corrective-retry' | 'needs-review';

/**
 * The structured stage exit. Field names are pinned against the pinned CLI's
 * documented `--json-schema` option and re-verified live against 2.1.265
 * (task 5.11 / OQ3): the object arrives as `structured_output` on the terminal
 * `result` event.
 */
export interface StageExit {
  status: string;
  artifacts: string[];
  summary: string;
}

/** The JSON Schema the driver pins the stage exit to. */
export const STAGE_EXIT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['status'],
  additionalProperties: false,
} as const;

const STAGE_EXIT_JSON = JSON.stringify(STAGE_EXIT_SCHEMA);

/** One permission denial, recorded as data — never a credential (task 5.12). */
export interface PermissionDenial {
  tool_name: string;
  tool_use_id: string;
}

export interface DriverOptions {
  /** Directory holding the scaffolded harness (the ICM-carrying output). */
  dir: string;
  /** Stage id to drive. Defaults to `01`. Only stage `01` has a contract here. */
  stage?: string;
  /**
   * The conversation input the contract's Inputs table names
   * (`User | (conversation) | The requested change`). Without it the stage can
   * only report that it is blocked — which is honest, not a bug.
   */
  request?: string;
  /**
   * Resume session id for the single corrective re-invoke (same session, per
   * the unit FR). Absent on the first invocation.
   */
  resumeSessionId?: string;
  /** Working directory for the invocation. Defaults to `dir`. */
  cwd?: string;
  /**
   * Opt-in, never default: grant the stage its write tools. The stage's job is
   * to produce an artifact, so a headless run denies writes unless the operator
   * says otherwise — and the grant is recorded in the run record (task 5.12:
   * a permission decision must be visible, not silent). Even granted, a denial
   * is still reported as data.
   */
  allowWrites?: boolean;
}

/** The invocation record — assertable, and the no-timers guard reads it. */
export interface InvocationRecord {
  command: string;
  args: string[];
  cwd: string;
  /** Always `false`. Present as an explicit, assertable claim. */
  timeoutPassed: boolean;
  /** Always `false` — the `--bare` regression guard (task 5.13). */
  barePassed: boolean;
  /** True only when the operator opted in via `allowWrites`. */
  writesGranted: boolean;
}

/** Everything `runSeam` needs to decide, with no I/O. Pure + testable. */
export interface Observation {
  invocation: InvocationRecord;
  /** The transcript's `result` events, in arrival order. */
  resultEvents: Array<Record<string, unknown>>;
  /** Raw tail, kept only for the needs-review report (no scraping). */
  tail: string;
}

export interface RunRecord {
  runId: string;
  stage: string;
  outcome: SeamOutcome;
  status: string;
  sessionId: string | null;
  stageExit: StageExit | null;
  permissionDenials: PermissionDenial[];
  /** Empty unless a deny occurred — surfaced, never swallowed (task 5.12). */
  permissionDenialReport: string[];
  invocation: InvocationRecord;
  correctiveInvocation: InvocationRecord | null;
  contractPath: string;
  /** Inputs-table rows resolved against the tree (task 5.3). */
  inputs: StageInput[];
  sidecarPath: string;
  outputDir: string;
  /** The run directory holding the sidecar, the transcript, and the run-local ledger. */
  runDir: string;
  /**
   * The composed prompt — the emit contract plus its resolved Inputs — written
   * as the run's proof of *input*.
   *
   * This exists because the transcript cannot carry that proof. `stream-json`
   * emits the model's *output stream*; the CLI does not echo the prompt it was
   * given. So a run whose transcript is the only artifact can show what the
   * stage said but never what it was fed — and "the emitted contract is the
   * consumed input" is precisely the claim task 5.10 asks the run to capture.
   * Verified on 2.1.265: the prompt text appears zero times in the transcript.
   */
  promptPath: string;
  /**
   * The raw `claude -p` transcript, kept as the run's proof artifact (task
   * 5.10). Captured because the seam test's whole claim is "the emitted
   * contract is what was consumed" — deleting it would leave that claim
   * unprovable after the fact.
   */
  transcriptPath: string;
}

/**
 * Guard against the `--bare` regression (task 5.13). Throws rather than warns:
 * a harness run that skips discovery loads nothing while still appearing to
 * succeed, which is exactly the silent failure the spec calls out.
 */
export function assertNoBare(args: string[]): void {
  if (args.includes('--bare')) {
    throw new Error(
      'seam-driver: refusing to pass `--bare` for a harness run. `--bare` skips ' +
        'discovery of CLAUDE.md, .claude/, skills and subagents — precisely the ' +
        'content an ICM harness is — so the run would load nothing while still ' +
        'appearing to succeed (spec deviation, task 5.13 / ADR-282).',
    );
  }
}

/**
 * Build the invocation record. The absence of any timeout parameter is the
 * point, not an oversight: liveness replaces timers (no-timers rule).
 */
export function buildInvocation(opts: DriverOptions): InvocationRecord {
  const cwd = resolve(opts.cwd ?? opts.dir);
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    // Required by the CLI for stream-json under `-p`; not a liveness timer.
    '--verbose',
    // The pinned typed exit (OQ3). A typed field, not a tail scrape.
    '--json-schema',
    STAGE_EXIT_JSON,
  ];
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
  if (opts.allowWrites) {
    // Scoped grant, not `--allow-dangerously-skip-permissions`: the stage needs
    // Write/Edit to produce its artifact, and nothing more.
    args.push('--permission-mode', 'acceptEdits');
  }
  assertNoBare(args);
  return {
    command: 'claude',
    args,
    cwd,
    timeoutPassed: false,
    barePassed: false,
    writesGranted: Boolean(opts.allowWrites),
  };
}

/** Parse one `stream-json` line. Non-JSON lines (banners) return null. */
export function parseStreamJsonLine(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Pull the terminal `result` events out of a full transcript. */
export function parseStreamJsonTranscript(raw: string): {
  resultEvents: Array<Record<string, unknown>>;
  sessionId: string | null;
} {
  const resultEvents: Array<Record<string, unknown>> = [];
  let sessionId: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const ev = parseStreamJsonLine(line);
    if (!ev) continue;
    if (typeof ev.session_id === 'string' && ev.session_id) sessionId = ev.session_id;
    if (ev.type === 'result') resultEvents.push(ev);
  }
  return { resultEvents, sessionId };
}

/** True when the object matches the pinned `StageExit` shape. */
function isStageExit(v: unknown): v is StageExit {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.status !== 'string' || o.status.length === 0) return false;
  if (o.artifacts !== undefined) {
    if (!Array.isArray(o.artifacts) || o.artifacts.some((a) => typeof a !== 'string')) {
      return false;
    }
  }
  if (o.summary !== undefined && typeof o.summary !== 'string') return false;
  return true;
}

/** Normalise a raw `structured_output` (or its JSON string form) to StageExit. */
export function readStageExit(ev: Record<string, unknown>): StageExit | null {
  const raw: unknown = ev.structured_output;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const parsed = parseStreamJsonLine(raw);
    return isStageExit(parsed) ? parsed : null;
  }
  return isStageExit(raw) ? raw : null;
}

/**
 * Map an observation onto the three named failure semantics (task 5.6):
 *   valid structured exit → `done`
 *   malformed tail        → `corrective-retry`
 *   absent tail           → `needs-review`
 * Exactly one corrective re-invoke is allowed per run; a second failure is
 * `needs-review`, surfaced as a held state for Chris — never auto-killed and
 * never silent.
 */
export function decideOutcome(obs: Observation): {
  outcome: SeamOutcome;
  stageExit: StageExit | null;
} {
  const exits = obs.resultEvents.map(readStageExit).filter((x): x is StageExit => x !== null);
  const last = exits.length > 0 ? exits[exits.length - 1] : null;
  if (last) return { outcome: 'done', stageExit: last };

  // The tail is `absent` when the transcript produced no result event at all.
  const noResultEvent = obs.resultEvents.length === 0;
  const tailIsEmpty = obs.tail.trim().length === 0 || noResultEvent;
  return { outcome: tailIsEmpty ? 'needs-review' : 'corrective-retry', stageExit: null };
}

/** Extract permission denials as data — tool/scope only, no credentials. */
export function collectPermissionDenials(
  resultEvents: Array<Record<string, unknown>>,
): PermissionDenial[] {
  const out: PermissionDenial[] = [];
  for (const ev of resultEvents) {
    const denials = ev.permission_denials;
    if (!Array.isArray(denials)) continue;
    for (const d of denials) {
      if (!d || typeof d !== 'object') continue;
      const o = d as Record<string, unknown>;
      if (typeof o.tool_name === 'string') {
        out.push({
          tool_name: o.tool_name,
          tool_use_id: typeof o.tool_use_id === 'string' ? o.tool_use_id : '',
        });
      }
    }
  }
  return out;
}

/**
 * The denial report (task 5.12). A denial must be visible even when the stage
 * otherwise exits cleanly: an unreported denial would let a stage claim success
 * without having done its work.
 */
export function formatDenialReport(denials: PermissionDenial[], stage: string): string[] {
  if (denials.length === 0) return [];
  const names = Array.from(new Set(denials.map((d) => d.tool_name))).sort();
  return [
    `SEAM DENIAL (stage ${stage}): ${denials.length} permission denial(s) tool/scope=${names.join(', ')}.`,
    'Reported as data, not swallowed: this stage may have exited clean without doing its work.',
    'Held for Chris — never auto-killed, never silent.',
  ];
}

/**
 * One row of the stage contract's `## Inputs` table (task 5.3). The Layer 2
 * contract names the files loaded from Layers 3 and 4, so the driver resolves
 * *those paths* rather than loading the whole workspace.
 */
export interface StageInput {
  source: string;
  location: string;
  scope: string;
  content: string;
  /** True when the location backtick named a file that exists on disk. */
  resolved: boolean;
}

/** Parse the `## Inputs` markdown table out of a stage contract. */
export function parseStageInputs(contract: string): Array<Omit<StageInput, 'content' | 'resolved'>> {
  const lines = contract.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Inputs\s*$/.test(l.trim()));
  if (start < 0) return [];
  const rows: Array<Omit<StageInput, 'content' | 'resolved'>> = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^-{2,}$/.test(cells[0]!.replace(/:/g, ''))) continue;
    if (cells[0] === 'Source') continue;
    rows.push({
      source: cells[0]!,
      location: cells[1]!,
      scope: cells[2]!,
    });
  }
  return rows;
}

/** Extract the named section (`## X`) from a file, or the whole file. */
export function extractSection(body: string, section: string): string {
  const name = section.replace(/["'`]/g, '').trim();
  if (!name || /^full value$/i.test(name)) return body;
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s+/.test(l) && l.replace(/^#{1,6}\s+/, '').trim() === name);
  if (start < 0) return body;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i] ?? '')) break;
    out.push(lines[i] ?? '');
  }
  const trimmed = out.join('\n').trim();
  return trimmed.length > 0 ? trimmed : body;
}

/**
 * Resolve the stage contract's Inputs table against the scaffolded tree: each
 * row whose backticked location names a real file is read, scoped to the row's
 * Section/Scope. Unresolvable rows are reported (`resolved: false`) rather than
 * silently dropped — a missing Layer 3 file is a fact the run should carry.
 */
export async function resolveStageInputs(
  dir: string,
  stage: string,
  contract: string,
): Promise<StageInput[]> {
  const stageDir = await resolveStageDir(dir, stage);
  const base = stageDir ?? resolve(dir, 'stages', stage);
  const out: StageInput[] = [];
  for (const row of parseStageInputs(contract)) {
    const m = row.location.match(/`([^`]+)`/);
    const rel = m?.[1]?.trim();
    const isPath = Boolean(rel && (rel.startsWith('.') || rel.includes('/') === false) && /\.[a-z]+\b/i.test(rel));
    let content = '';
    let resolved = false;
    if (isPath && rel) {
      // Only relative paths are resolved — never an absolute path out of the tree.
      const abs = rel.startsWith('.') ? resolve(base, rel) : resolve(base, rel);
      if (!rel.startsWith('/') && existsSync(abs)) {
        content = extractSection(await readFile(abs, 'utf-8'), row.scope);
        resolved = true;
      }
    }
    out.push({ ...row, content, resolved });
  }
  return out;
}

/**
 * Compose the prompt (task 5.3). The contract is the input **verbatim** — the
 * seam's whole point — with the Inputs-table files appended as explicitly
 * scoped context, and the user's request appended as the conversation row the
 * table names. Nothing else from the workspace is loaded.
 */
export function composePrompt(
  contract: string,
  inputs: StageInput[],
  request?: string,
): string {
  const resolved = inputs.filter((i) => i.resolved);
  const parts = [contract];
  if (resolved.length > 0) {
    const blocks = resolved.map(
      (i) =>
        `### Input: ${i.source} — ${i.location}\n` +
        `(scope: ${i.scope})\n\n${i.content.trim()}\n`,
    );
    parts.push(
      `---\n\n## Resolved inputs (Layer 2 contract: named files only)\n\n${blocks.join('\n')}`,
    );
  }
  if (request && request.trim().length > 0) {
    // The Inputs table's first row is `User | (conversation) | The requested
    // change` — this is that input, named so the stage can find it.
    parts.push(`---\n\n## Requested change (Inputs: User / (conversation))\n\n${request.trim()}`);
  }
  return parts.join('\n\n');
}

/**
 * Resolve a stage id to its emitted directory. The catalog emits stage dirs as
 * `<id>-<name>` zero-padded in order (`01-plan`, `02-implement`, …), while the
 * stage *id* is the bare number that the ledger row and the sidecar carry
 * (tasks 5.4, 5.5). Resolving by prefix keeps the id and the directory in one
 * place instead of hard-coding `01-plan` twice.
 */
export async function resolveStageDir(dir: string, stage: string): Promise<string | null> {
  const stagesRoot = join(resolve(dir), 'stages');
  if (!existsSync(stagesRoot)) return null;
  const entries = (await readdir(stagesRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const exact = entries.find((e) => e === stage);
  if (exact) return join(stagesRoot, exact);
  // Zero-padded prefix: `01` -> `01-plan`; never match `010-x` for stage `01`.
  const prefixed = entries.find((e) => e.startsWith(`${stage}-`));
  return prefixed ? join(stagesRoot, prefixed) : null;
}

/** Read the emitted stage contract. This is the seam's input, verbatim. */
export async function readStageContract(dir: string, stage: string): Promise<string> {
  const stageDir = await resolveStageDir(dir, stage);
  const p = stageDir ? join(stageDir, 'CONTEXT.md') : join(resolve(dir), 'stages', stage, 'CONTEXT.md');
  if (!existsSync(p)) {
    throw new Error(
      `seam-driver: no stage contract for stage ${stage} at ${p}. The seam is "the ` +
        `emitted contract is the pipeline's input" — scaffold a template that carries ` +
        `an ICM tree (e.g. --template vertical:coding) first (task 5.9).`,
    );
  }
  return readFile(p, 'utf-8');
}

export type SpawnClaude = (
  record: InvocationRecord,
  prompt: string,
) => Promise<{ raw: string; code: number }>;

/** Default spawner. Note: there is deliberately no timeout option here. */
export function spawnClaude(
  record: InvocationRecord,
  prompt: string,
): Promise<{ raw: string; code: number }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(record.command, record.args, {
      cwd: record.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // No `timeout` key — liveness replaces timers (task 5.8).
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (c: string) => {
      out += c;
    });
    child.stderr.on('data', (c: string) => {
      err += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ raw: `${out}${err ? `\n${err}` : ''}`, code: code ?? 0 });
    });
    child.stdin.end(prompt);
  });
}

let runCounter = 0;

/** A sortable, second-resolution run id (mirrors the queue's id shape). */
export function makeRunId(now = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const ts =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  runCounter += 1;
  return `${ts}-${p(runCounter, 4)}`;
}

/** The `stage_progress` sidecar (tasks 5.4, 5.6) — progress outside the ledger schema. */
export function buildSidecar(run: {
  runId: string;
  stage: string;
  status: string;
  outputs: string[];
  sessionId: string | null;
  denials: PermissionDenial[];
}): Record<string, unknown> {
  return {
    run_id: run.runId,
    stage: run.stage,
    status: run.status,
    outputs: run.outputs,
    session_id: run.sessionId,
    permission_denials: run.denials.map((d) => ({ tool_name: d.tool_name })),
  };
}

/** Files written under the stage's `output/` dir (the contract's Outputs honored). */
async function listOutputs(dir: string, stage: string): Promise<string[]> {
  const stageDir = await resolveStageDir(dir, stage);
  const out = stageDir ? join(stageDir, 'output') : join(resolve(dir), 'stages', stage, 'output');
  if (!existsSync(out)) return [];
  const names = await readdir(out);
  return names.filter((n) => n !== '.gitkeep').sort();
}

/**
 * Drive exactly one stage (task 5.2): one `claude -p` invocation, one corrective
 * re-invoke at most, one sidecar, and the run record. The ledger row is written
 * separately by `seam-ledger.ts` so the unit tests stay SQLite-free.
 */
export async function runSeam(
  opts: DriverOptions,
  spawner: SpawnClaude = spawnClaude,
): Promise<RunRecord> {
  const stage = opts.stage ?? '01';
  const dir = resolve(opts.dir);
  const runId = makeRunId();
  const stageDir = await resolveStageDir(dir, stage);
  const contractPath = stageDir ? join(stageDir, 'CONTEXT.md') : join(dir, 'stages', stage, 'CONTEXT.md');
  const contract = await readStageContract(dir, stage);
  // Task 5.3: the contract is fed verbatim, scoped to the files its Inputs
  // table names — not the whole workspace.
  const inputs = await resolveStageInputs(dir, stage, contract);
  const prompt = composePrompt(contract, inputs, opts.request);

  const first = buildInvocation(opts);
  const firstRun = await spawner(first, prompt);
  const firstParsed = parseStreamJsonTranscript(firstRun.raw);
  let observation: Observation = {
    invocation: first,
    resultEvents: firstParsed.resultEvents,
    tail: firstRun.raw,
  };
  let decision = decideOutcome(observation);
  let correctiveInvocation: InvocationRecord | null = null;
  let sessionId = firstParsed.sessionId;

  // Exactly one corrective re-invoke, on the same session.
  if (decision.outcome === 'corrective-retry') {
    const retryOpts: DriverOptions = { ...opts, resumeSessionId: sessionId ?? undefined };
    const retry = buildInvocation(retryOpts);
    correctiveInvocation = retry;
    const retryRun = await spawner(retry, prompt);
    const retryParsed = parseStreamJsonTranscript(retryRun.raw);
    observation = {
      invocation: retry,
      resultEvents: retryParsed.resultEvents,
      tail: retryRun.raw,
    };
    decision = decideOutcome(observation);
    if (retryParsed.sessionId) sessionId = retryParsed.sessionId;
  }

  // The corrective retry is now spent. A second failure cannot retry again —
  // `corrective-retry` is an *instruction to retry*, never a terminal verdict,
  // so leaving it here would invite an unbounded retry loop and quietly break
  // the unit FR's "exactly one corrective re-invoke". Past the retry, the run
  // is surfaced as `needs-review`: a held state for Chris, never auto-killed.
  const terminal: SeamOutcome =
    decision.outcome === 'corrective-retry' ? 'needs-review' : decision.outcome;

  const denials = collectPermissionDenials(observation.resultEvents);
  const outputs = await listOutputs(dir, stage);
  const status =
    terminal === 'done' ? (decision.stageExit?.status ?? 'done') : 'needs-review';

  const runDir = join(dir, 'runs', runId);
  const sidecarPath = join(runDir, 'stage_progress.json');
  const transcriptPath = join(runDir, 'transcript.jsonl');
  const promptPath = join(runDir, 'prompt.md');
  const record: RunRecord = {
    runId,
    stage,
    outcome: terminal,
    status,
    sessionId,
    stageExit: decision.stageExit,
    permissionDenials: denials,
    permissionDenialReport: formatDenialReport(denials, stage),
    invocation: first,
    correctiveInvocation,
    contractPath,
    inputs,
    sidecarPath,
    outputDir: stageDir ? join(stageDir, 'output') : join(dir, 'stages', stage, 'output'),
    transcriptPath,
    runDir,
    promptPath,
  };

  await mkdir(runDir, { recursive: true });
  // The prompt is written FIRST: it is the seam's actual input, so a run record
  // that survived without it would be unable to prove its central claim.
  await writeFile(promptPath, prompt, 'utf-8');
  // The transcript is written BEFORE the sidecar: the sidecar names the run's
  // state, and a sidecar pointing at a transcript that was never written would
  // be the run record lying about its own evidence.
  await writeFile(transcriptPath, observation.tail, 'utf-8');
  await writeFile(
    sidecarPath,
    `${JSON.stringify(
      buildSidecar({
        runId,
        stage,
        status,
        outputs,
        sessionId,
        denials,
      }),
      null,
      2,
    )}\n`,
    'utf-8',
  );
  return record;
}

/** Human lines for the run (kept next to the driver, used by the CLI + docs). */
export function formatRun(run: RunRecord): string[] {
  const lines = [
    `seam run ${run.runId}: stage ${run.stage} -> ${run.outcome} (status=${run.status})`,
    `contract (the seam input): ${relative(process.cwd(), run.contractPath)}`,
    `prompt (proof of input): ${relative(process.cwd(), run.promptPath)}`,
    `sidecar: ${relative(process.cwd(), run.sidecarPath)}`,
    `transcript: ${relative(process.cwd(), run.transcriptPath)}`,
    `outputs: ${run.outputDir}`,
    `scoped inputs: ${run.inputs.filter((i) => i.resolved).length}/${run.inputs.length} resolved from the contract's Inputs table`,
  ];
  if (run.correctiveInvocation) lines.push('corrective re-invoke: 1 (same session)');
  lines.push(
    run.invocation.writesGranted
      ? 'writes: GRANTED by operator (--allow-writes); denials still reported as data'
      : 'writes: denied (default) — the stage can read and plan, not write',
  );
  lines.push(...run.permissionDenialReport);
  return lines;
}

/**
 * True when the stage contract's Outputs section was honored end to end: the
 * run terminated `done` and its `output/` dir holds at least one real artifact
 * (`.gitkeep` is the shape marker, not an artifact). Deliberately keyed on the
 * artifacts on disk rather than on the typed exit's own claim — a stage that
 * claims an artifact it never wrote must not pass.
 */
export function outputsHonored(run: RunRecord, outputs: string[]): boolean {
  if (run.outcome !== 'done') return false;
  return outputs.some((o) => o.length > 0 && o !== '.gitkeep');
}

/**
 * Artifacts present on disk that the typed exit did not claim. Surfaced rather
 * than ignored: an unclaimed artifact means the contract's Outputs section and
 * the stage's own report disagree, which is worth Chris seeing.
 */
export function unclaimedArtifacts(run: RunRecord, outputs: string[]): string[] {
  const claimed = new Set((run.stageExit?.artifacts ?? []).map((a) => basename(a)));
  return outputs.filter((o) => o !== '.gitkeep' && !claimed.has(o));
}
