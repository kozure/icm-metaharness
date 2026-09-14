// SPDX-License-Identifier: MIT
//
// `harness seam` — drive ONE stage of an emitted ICM harness through a single
// headless invocation (Unit 5, tasks 5.2, 5.9, 5.10, 5.12). ADR-282.
//
// This is the thin CLI wrapper: it puts the driver's run record and the denial
// report on stdout and maps the run onto the ledger, so the seam test is
// reproducible from the command line rather than only from a test file.
//
// Exit codes are part of the contract: `done` -> 0, `needs-review` -> 1. A
// non-zero exit here means "held for a human", never "run the stage harder" —
// the run is a held state, not a failure to retry.

import { resolve } from 'node:path';
import { formatRun, runSeam } from './seam-driver.js';
import {
  buildLedgerRow,
  countLedgerRows,
  resolveBridgeDir,
  runLocalLedgerPath,
  writeLedgerRow,
  type LedgerWriteResult,
} from './seam-ledger.js';
import type { SubcommandResult } from './subcommands.js';

export async function seamCmd(args: string[]): Promise<SubcommandResult> {
  const positional = args.filter((a) => !a.startsWith('--'));
  const dir = resolve(positional[0] ?? process.cwd());
  const stage = positional[1] ?? '01';
  const json = args.includes('--json');
  // The Inputs table's `User | (conversation)` row — without it the stage can
  // only honestly report that it is blocked.
  const ri = args.indexOf('--request');
  const request = ri >= 0 ? args[ri + 1] : undefined;

  const allowWrites = args.includes('--allow-writes');
  const run = await runSeam({ dir, stage, request, allowWrites });

  // Task 5.5: exactly one row, mapped onto the EXISTING schema, written to the
  // RUN-LOCAL ledger — never the operator's live bridge ledger (ADR-282 D2).
  // A failure to write is reported, not swallowed; the sidecar still carries
  // the state.
  const dbPath = runLocalLedgerPath(run.runDir);
  const bridgeDir = resolveBridgeDir();
  const ledger: LedgerWriteResult = writeLedgerRow(
    buildLedgerRow({
      runId: run.runId,
      sessionId: run.sessionId,
      contractPath: run.contractPath,
      dir,
      status: run.status,
    }),
    dbPath,
  );
  // Independent of what the write claimed: count the rows back (task 5.4 —
  // "keep the ledger row count at exactly one for this run").
  const rowCount = ledger.ok ? countLedgerRows(run.runId, dbPath) : null;

  const lines = json
    ? [
        JSON.stringify(
          {
            run_id: run.runId,
            stage: run.stage,
            outcome: run.outcome,
            status: run.status,
            stage_exit: run.stageExit,
            session_id: run.sessionId,
            sidecar: run.sidecarPath,
            prompt: run.promptPath,
            transcript: run.transcriptPath,
            output_dir: run.outputDir,
            permission_denials: run.permissionDenials,
            writes_granted: run.invocation.writesGranted,
            ledger: ledger.ok
              ? { rows: rowCount, db: ledger.dbPath }
              : { rows: 0, reason: ledger.reason },
          },
          null,
          2,
        ),
      ]
    : [
        ...formatRun(run),
        ledger.ok
          ? `ledger: ${rowCount ?? '?'} row (${run.status}) -> ${ledger.dbPath} (run-local; the operator ledger is untouched)`
          : `ledger: NOT written — ${ledger.reason}`,
        bridgeDir
          ? 'ledger module: claude_bridge found — schema reuse exercised'
          : 'ledger module: claude_bridge NOT found — the row was not written (sidecar still carries the state)',
      ];

  return { code: run.outcome === 'done' ? 0 : 1, lines };
}
