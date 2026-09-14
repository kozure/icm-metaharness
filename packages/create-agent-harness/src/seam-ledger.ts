// SPDX-License-Identifier: MIT
//
// Seam driver ledger mapping (Unit 5, tasks 5.5, 5.4). ADR-282.
//
// Exactly ONE row per run, with stage `01` semantics carried in the sidecar and
// the row's status matching the sidecar. **No columns are added and the ledger
// schema is not migrated** — the unit FR requires the existing schema to hold,
// and task 5.5 says: if the mapping cannot be expressed in the current schema,
// stop and report rather than migrating the ledger.
//
// It IS expressible. `claude_bridge`'s `tasks` table already carries everything
// the run needs:
//
//   task_id            <- the run id
//   claude_session_id  <- the bridge-managed session identity (same session on
//                         the corrective re-invoke)
//   agent_id           <- the originating agent (overridable; see
//                         DEFAULT_AGENT_ID)
//   prompt             <- the stage contract path; the seam input, verbatim
//   cwd                <- the scaffolded harness dir
//   last_state         <- the sidecar's status (`done` / `needs-review`)
//   pending_result     <- 0; a terminal run, nothing to collect
//   timeout_min        <- 0, a documented sentinel meaning "no timer passed"
//
// `timeout_min` is NOT NULL DEFAULT 30, so it must carry a value. `0` is chosen
// over the default `30` deliberately: this run passes no timeout at all, and a
// row that silently claimed a 30-minute timer would be the exact contradiction
// the no-timers rule exists to prevent. `0` reads as "no timer" and is asserted
// by the driver test.
//
// The row is written through the ledger module's OWN public API (`insert_task`)
// rather than by opening SQLite here, so the schema lives in exactly one place.
// That module is Python and lives in the operator workspace, so the mapping is
// executed by `python3` rather than reimplemented in TypeScript — see ADR-282
// deviations D1 (where the code lives) and D2 (which database it writes to).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** The ledger row as the driver intends it. Asserted by the driver test. */
export interface LedgerRow {
  task_id: string;
  claude_session_id: string | null;
  agent_id: string;
  prompt: string;
  cwd: string;
  last_state: string;
  pending_result: 0;
  /** Sentinel: `0` means the invocation passed no timeout (no-timers rule). */
  timeout_min: 0;
}

export interface LedgerWriteResult {
  ok: boolean;
  /** Set when `ok` is false, or when the module could not be located. */
  reason?: string;
  dbPath?: string;
}

/**
 * The default `agent_id` for a seam row, overridable per run.
 *
 * A constant rather than a literal so the value is one edit, and chosen to be
 * an honest fallback: `seam` names the driver itself rather than any particular
 * operator identity, which would not belong in a public repo.
 */
export const DEFAULT_AGENT_ID = 'seam';

/**
 * The database a seam run writes to: **a run-local file, never the operator's
 * live bridge ledger** (ADR-282 deviation D2).
 *
 * `claude_bridge`'s `_default_db_path()` points into the operator's home
 * directory — the ledger the bridge itself runs on. A seam run is a *test of
 * the seam*, so writing there appends test rows to live operational state:
 * they are indistinguishable from real task rows and `list_all()` hands them
 * back to the bridge.
 *
 * This was a real defect, not a hypothetical. Three live seam runs appended
 * three rows to the operator ledger before this guard existed. They at least
 * carried the agent id and `timeout_min=0`, so they were tagged — but tagged
 * is not contained. A run-local db is disposable with the run directory, and
 * the write is still exercised through the ledger's own `insert_task`, so the
 * schema stays single-sourced.
 */
export function runLocalLedgerPath(runDir: string): string {
  return join(resolve(runDir), 'ledger.db');
}

/**
 * Locate the `claude_bridge` package dir. Overridable, because the module lives
 * outside this repository — in whatever workspace the operator runs the bridge
 * from.
 *
 * `CLAUDE_BRIDGE_DIR` is the supported way to point at it, and the candidate
 * list stays deliberately generic: this is a public fork, so no specific
 * operator's workspace layout belongs in it. Discovery is best-effort — a miss
 * means the ledger row is skipped with a reason, not that the run fails.
 */
export function resolveBridgeDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.CLAUDE_BRIDGE_DIR,
    join(homedir(), 'claude_bridge'),
    join(process.cwd(), 'claude_bridge'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    if (existsSync(join(c, 'ledger.py'))) return c;
  }
  return null;
}

/**
 * Map a run onto the existing schema. Pure — no I/O — so the mapping can be
 * asserted without a database, and so a schema change would fail loudly here.
 */
export function buildLedgerRow(run: {
  runId: string;
  sessionId: string | null;
  contractPath: string;
  dir: string;
  status: string;
  agentId?: string;
}): LedgerRow {
  return {
    task_id: run.runId,
    claude_session_id: run.sessionId,
    agent_id: run.agentId ?? DEFAULT_AGENT_ID,
    prompt: resolve(run.contractPath),
    cwd: resolve(run.dir),
    last_state: run.status,
    pending_result: 0,
    timeout_min: 0,
  };
}

/**
 * The `python3` bootstrap shared by the write and the count paths. The database
 * is passed **explicitly**: `Ledger()` with no argument resolves
 * `_default_db_path()` and would write to the operator's live ledger.
 */
const pyBootstrap = (bridgeDir: string, dbPath: string): string =>
  [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(bridgeDir)})`,
    'from ledger import Ledger',
    `ledger = Ledger(${JSON.stringify(dbPath)})`,
    'ledger.init_schema()',
  ].join('\n');

/**
 * Write the single ledger row through the ledger's own `insert_task`, into
 * `dbPath` (the run-local database). Returns `{ok:false, reason}` rather than
 * throwing when the module is absent: the seam test must be runnable — and
 * honestly report the gap — on a machine with no bridge install, instead of
 * failing as though the seam itself were broken.
 */
export function writeLedgerRow(
  row: LedgerRow,
  dbPath: string,
  bridgeDir: string | null = resolveBridgeDir(),
): LedgerWriteResult {
  if (!bridgeDir) {
    return {
      ok: false,
      reason:
        'claude_bridge not found (set CLAUDE_BRIDGE_DIR). The ledger row was NOT written; ' +
        'the sidecar still carries the run state.',
    };
  }
  const script = [
    pyBootstrap(bridgeDir, dbPath),
    'row = json.loads(sys.argv[2])',
    'ledger.insert_task(row["task_id"], None, None, row["claude_session_id"],',
    '                   row["prompt"], row["cwd"], row["timeout_min"],',
    '                   pending_result=False, agent_id=row["agent_id"])',
    'ledger.update_last_state(row["task_id"], row["last_state"])',
    'print(ledger.db_path)',
  ].join('\n');

  const proc = spawnSync('python3', ['-c', script, bridgeDir, JSON.stringify(row)], {
    encoding: 'utf-8',
  });
  if (proc.error) return { ok: false, reason: `python3 failed: ${proc.error.message}` };
  if (proc.status !== 0) {
    return {
      ok: false,
      reason: `ledger insert failed (exit ${proc.status}): ${(proc.stderr ?? '').trim()}`,
    };
  }
  return { ok: true, dbPath: (proc.stdout ?? '').trim() };
}

/** Count rows for a run id, in the run-local db (task 5.4: exactly one). */
export function countLedgerRows(
  runId: string,
  dbPath: string,
  bridgeDir: string | null = resolveBridgeDir(),
): number | null {
  if (!bridgeDir) return null;
  const script = [
    pyBootstrap(bridgeDir, dbPath),
    'rows = [r for r in ledger.list_all() if r["task_id"] == sys.argv[2]]',
    'print(len(rows))',
  ].join('\n');
  const proc = spawnSync('python3', ['-c', script, bridgeDir, runId], { encoding: 'utf-8' });
  if (proc.status !== 0) return null;
  const n = Number.parseInt((proc.stdout ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}
