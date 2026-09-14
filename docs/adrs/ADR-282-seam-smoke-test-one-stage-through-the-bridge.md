# ADR-282: Seam smoke test — one stage driven through the bridge under the no-timers rule

- **Status**: Accepted — implemented by `src/seam-driver.ts` + `src/seam-ledger.ts` + `src/seam-cmd.ts`; `__tests__/seam-driver.test.ts` is the committed form (27 tests, mutations falsified before commit).
- **Date**: 2026-09-13
- **Deciders**: Chris (kozure) — fork owner.
- **Tags**: fork, icm, seam, claude-code, stream-json, ledger, liveness, no-timers, harness-generator
- **Extends**: ADR-279 (fork design — pin policy, `--icm` opt-in emission, `CLAUDE.md` ownership); ADR-280 (fork CI triggers); ADR-281 (headless onboarding)
- **Related**: `docs/specs/01-spec-icm-generator-emission/01-tasks-icm-generator-emission.md` Unit 5 (5.1–5.13); Claude Code CLI **2.1.265**; `claude_bridge/ledger.py` (operator workspace); upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: Units 2–4 emit and fill the ICM contract tree but never *consume* it. Nothing proved the emitted `stages/01-plan/CONTEXT.md` is the pipeline's actual **input** as opposed to a document that merely exists. Unit 5 closes that gap by driving one stage end to end.

---

## Context

Units 2–4 produce a five-layer ICM harness: `--icm` emits the contract tree (ADR-279) and `--answers` fills its placeholders (ADR-281). Both are exercised against the *tree on disk* — `icm-off`, `icm-scaffold`, `onboarding`, `generated-templates`. Every one of those tests asserts something about files.

That leaves the seam itself unproven. The spec's Unit 5 framing is exact: the emitted harness is consumed as the pipeline's **input** — the stage contract is what the driver feeds to a harness, not a prompt re-derived from the same data by the driver. A test that reads the contract and checks its contents cannot distinguish "this contract is the input" from "the driver wrote its own prompt and the contract happens to agree", and the two diverge the moment someone edits one side.

Five things had to be decided, and each is a fork-level constraint:

1. **How the seam is fed.** Recomputing the prompt inside the driver would make the contract decorative — the seam would be "the contract and the prompt both derive from `catalog.def.mjs`", which is a *shared source*, not a *seam*. The contract must be the literal input, and the run must be able to prove it later.
2. **How the stage signals its exit.** Scraping a `STAGE_EXIT:` line from the transcript tail is prose-scraping: it fails on a reworded line, and it cannot distinguish "the stage said done" from "the stage mentioned the string done". The pinned CLI documents structured output, so the exit can be a typed field. The spec makes this a deliberate deviation and requires the fallback be deleted rather than left as dead code (OQ4).
3. **Which database the run may write to.** The `claude_bridge` ledger is *live operational state* — the ledger the operator's own bridge runs on. A seam run is a test, so its rows must not land there.
4. **What the ledger mapping does to the schema.** Task 5.5 is explicit: no new columns; if the mapping cannot be expressed in the existing schema, **stop and report** rather than migrating.
5. **How silence is treated.** Liveness replaces timers system-wide: no timeout parameter is ever passed, and a silent run is a *named state* to be polled, never a failure trigger and never something to auto-kill.

---

## Decision

### 1. The driver feeds the emitted contract **verbatim**, and saves the prompt as proof of input

The seam sentence from task 5.1 is the header comment of `seam-driver.ts`. `composePrompt(contract, inputs, request)` takes the contract **as read from `stages/01-plan/CONTEXT.md`** and appends the resolved-Inputs block and the requested change. It never re-derives the contract body.

The run then writes the composed prompt to `runs/<runId>/prompt.md`, and this is not redundant. Verified against CLI 2.1.265: **`--output-format stream-json` does not echo the input prompt.** The stream carries the model's output events only, so a run holding just a transcript can show what the stage *said* and never what it was *fed* — and "the emitted contract is the consumed input" is precisely the claim the unit exists to capture. `prompt.md` is written before the transcript and the sidecar, so a run record that survived without it cannot silently drop its own central evidence.

### 2. The stage exit is a **typed field**, and the tail-scrape fallback is **deleted**

The invocation passes `--json-schema` with `STAGE_EXIT_SCHEMA` pinned in source and in the fixtures:

```json
{ "status": "…", "artifacts": ["…"], "summary": "…" }
```

The typed object arrives as `structured_output` on the terminal `result` event. `stageExitFrom(ev)` normalises both the object and its JSON-string form. Per OQ4 the tail-scrape is **not** retained as a fallback — it would be unreachable code, and dead failure paths are indistinguishable from working ones in review. A test asserts the driver does not scrape prose (`does not scrape prose from the transcript tail`).

### 3. Failure semantics are three named outcomes over the transcript tail

| Tail | Outcome | Behaviour |
|---|---|---|
| valid structured exit | `done` | terminal |
| malformed | `corrective-retry` | **one** corrective re-invoke, on the **same** session id |
| absent | `needs-review` | terminal, **held** for Chris — never auto-kill, never silent |

The corrective retry is capped at one by construction, and that cap has its own test: a second failure resolves to `needs-review` rather than looping. Silence is surfaced as a state, matching the system-wide liveness rule — silence is evidence, not a trigger.

### 4. **No timeout parameter is ever passed** — asserted, not merely intended

The default spawner has no timeout option at all, and `buildInvocation` records `timeoutPassed: false`. The test inspects the **invocation record across every invocation** (initial and corrective) and fails if any timeout key appears. This turns the liveness rule from a convention into a regression guard, which is the only form of it that survives a future edit.

### 5. The `--bare` guard is a hard throw

`--bare` skips discovery of `CLAUDE.md`, `.claude/`, skills, and subagents — exactly the content an ICM harness *is* — and the CLI is documented as moving toward making it the default. A silent flip would make harness runs load nothing while still appearing to succeed: the worst failure mode available here, because every artifact would still be written. `assertNoBare` throws rather than warns, and the CLI version the driver was validated against (2.1.265) is recorded in the header comment so an upgrade is caught in review rather than in production.

### 6. The run writes to a **run-local** ledger, never the operator's

The `claude_bridge` ledger lives outside this repository, in the operator's workspace, and is the ledger the operator's own agent runs on. `runLocalLedgerPath(runDir)` puts the seam run's database **inside the run directory**, and the database is passed **explicitly** to `Ledger(...)`: a bare `Ledger()` resolves `_default_db_path()` and would write to live operational state. A test asserts containment (the db is under `runs/<runId>/` and cannot be the bridge path).

`resolveBridgeDir` finds the package via `CLAUDE_BRIDGE_DIR` or a generic `claude_bridge/` under `$HOME` or the cwd — deliberately generic, because no specific operator's workspace layout belongs in a public fork. A miss is handled: the row is skipped with a reason, and the run still succeeds.

The row is still written through the ledger's **own** `insert_task`, so the schema stays single-sourced rather than reimplemented in TypeScript.

### 7. The mapping fits the existing schema — **no columns added, no migration**

Task 5.5 permits reporting instead of migrating; it is not needed, because `tasks` already carries everything:

| Column | Value |
|---|---|
| `task_id` | the run id |
| `claude_session_id` | the bridge-managed session (the same one on the corrective re-invoke) |
| `agent_id` | `seam` (`DEFAULT_AGENT_ID`, overridable) |
| `prompt` | the stage contract path — the seam input |
| `cwd` | the scaffolded harness dir |
| `last_state` | the sidecar's status (`done` / `needs-review`) |
| `pending_result` | `0` — a terminal run, nothing to collect |
| `timeout_min` | `0` — the no-timer sentinel |

`timeout_min` is `NOT NULL DEFAULT 30`, so it must carry a value. `0` is chosen over the default deliberately: the run passes no timeout, and a row claiming a 30-minute timer would be the exact contradiction the no-timers rule exists to prevent. `buildLedgerRow` is pure — no I/O — so the mapping is asserted without a database and a schema change would fail loudly at that one site.

### 8. Permission denials are **data**, surfaced as a named output

The typed `result` event's `permission_denials` is collected into the run record and printed alongside the sidecar. Per the spec's Security Considerations an unreported denial would let a stage claim success without having done its work, so a denial must be visible even when the stage exits cleanly. Only the denial's **tool/scope** is recorded — never credential material — and a test asserts exactly that.

---

## Consequences

**What changes.** `harness seam <dir> [stage] [--request "<change>"] [--json] [--allow-writes]` exists on the `harness` binary. A run produces four artifacts under `runs/<runId>/`: `prompt.md` (proof of input), `transcript.jsonl` (raw run), `stage_progress.json` (the sidecar — progress outside the ledger schema, task 5.4), and `ledger.db` (run-local). `timeout_min: 0` (the no-timer sentinel no ordinary row carries) and `agent_id: seam` mark every seam row as a seam row.

**What does not change.** The ledger schema, upstream's walker, and the emitted tree. `--icm`/`--answers` behaviour is untouched, so ADR-279's byte-equality-without-the-flag guarantee and ADR-281's strictness rules still hold.

**What hurts.**

- **The ledger row is written only when `claude_bridge` is importable.** `writeLedgerRow` returns `{ok:false, reason}` rather than throwing, so the driver stays runnable — and honestly reports the gap — on a machine without a bridge install. The sidecar still carries the state; the row does not. This is a deliberate partial: failing the run would conflate "the seam is broken" with "this machine has no bridge".
- **A live run costs a model call.** The unit's fixture tests are deterministic and need no network; only task 5.9's acceptance run is live.
- **`prompt.md` is a duplicate of `transcript.jsonl`'s *input*.** It is written because the transcript cannot carry that input (decision 1). If the CLI ever echoes the prompt, this file becomes derivable — but removing it then would lose the proof on older CLI versions.

---

## Alternatives Considered

1. **Recompute the contract inside the driver.** Rejected: it converts a seam into a shared source, and no test could then tell "fed the contract" from "regenerated something equivalent".
2. **Scrape a `STAGE_EXIT:` line from the transcript tail.** Rejected per OQ4: prose-scraping fails on rewording and cannot distinguish a stage's verdict from a mention of it. Retained only as the documented *reason* the typed field exists — the code was deleted, not left dead.
3. **Add a ledger column for stage id / run directory.** Rejected: task 5.5 forbids it, and it is unnecessary — stage `01` semantics ride in `last_state` and the sidecar, and the run directory is the row's `cwd`.
4. **Write to the operator ledger, distinguished by `agent_id`.** Rejected as insufficient: rows in live operational state that merely *carry* a tag are still returned by `list_all()` to the bridge. Tagged is not contained.
5. **Reimplement the ledger's schema in TypeScript.** Rejected: the schema would then exist in two languages and drift silently. The Python module stays the single source, invoked through its own public API.
6. **Shell out to a `python3` `result_parser.py` for stream-json.** Rejected as a new cross-language surface in 3-OS CI (see deviation D1).
7. **Pass a generous timeout to bound a runaway run.** Rejected: the unit FR forbids it, and it is the one rule this fork treats as load-bearing. A silent run is polled and reported, not bounded by a timer.

---

## Deviation D1 — reuse is *contractual*, not literal

Task 5.2 asks the driver to reuse `result_parser.py` and the `claude_bridge` ledger module. Both are Python and live in the **operator workspace**, not this repository (verified: zero references anywhere in the tree). Adding a Python runtime plus a workspace dependency to this TS package would introduce a cross-language surface into 3-OS CI, where `node:sqlite` — the only SQLite needing no new dependency — does not exist on Node 20.

**Equivalent:** reuse the *contracts*. `stream-json` is parsed here with the same event vocabulary the parser speaks, and the ledger row is written through the ledger's own `insert_task` so the schema is never duplicated. The ledger module **is** invoked for real (via `python3`) when it is present.

## Deviation D2 — the run-local ledger (a defect that shipped before it was caught)

The first three live seam runs appended three rows to the **operator's live ledger**: `20260913-183029-0001`, `20260913-183059-0001`, `20260913-183235-0001`. They carried the agent id and `timeout_min=0`, so they were tagged, but tagging is not containment: `list_all()` hands test rows back to the bridge as though they were tasks.

The rows are still present and were **not** deleted by the driver — removal from live state is Chris's call, not a test's side effect. Decision 6 is the fix, and `seam-ledger.ts` carries the account of the defect rather than only the guard.

## Deviation D3 — the driver's `--request` flag

The stage Inputs table's `User | (conversation)` row is the *starting point* of every stage contract, and without it a stage can only honestly report that it is blocked. `--request "<the change>"` supplies that row's value; it is not a re-derived prompt (decision 1), it is the resolution of one Inputs row.

---

## D2b — a second path leak, found while auditing D2's own fix

Writing D2 up exposed the same class of defect one layer down. `resolveBridgeDir` had a hardcoded candidate naming **the operator's own workspace path** — an environment-specific path committed to a public fork, in the very function whose job was to keep operator state out of the run. It is the D2 mistake in a different register: D2 wrote to live state at run time; this one published the layout in source.

`resolveBridgeDir` now searches `CLAUDE_BRIDGE_DIR`, then a generic `claude_bridge/` under `$HOME` or the cwd. `CLAUDE_BRIDGE_DIR` is the supported override, so an operator with an unusual layout configures it rather than having their layout hardcoded for everyone. A miss is not a failure: the row is skipped with a reason (the partial already documented in Consequences).

The ADR itself was trimmed the same way — it had recorded the operator's live-ledger path and the three rows' full temp-directory `cwd` values. Those are exactly the machine-specific paths the tasks file forbids in this tree, and the point survives without them: the rows are identifiable by `timeout_min: 0` (the no-timer sentinel — no ordinary bridge row carries it) plus a temp-dir `cwd`, which is enough to find them and enough to leave alone.

## A real defect found by running the seam (task 5.9)

The acceptance run caught a bug the whole of Unit 3 had missed. Every stage contract named its Layer 3 reference as `../references/CONTEXT.md`. The overlay emits `references/CONTEXT.md` at the **scaffold root**, so from `stages/01-plan/` that path resolves to `stages/references/` — a directory that does not exist. Unit 3 asserted the reference file *exists*, but never that the contract's path *to* it resolves; a file can exist and still be unreachable.

Fixed in `catalog.def.mjs` (`../references/` → `../../references/`, regenerated per `CONTRIBUTING.md`), and `icm-scaffold.test.ts` now resolves **every** relative `.md` path a contract names, from that stage's own directory. The two kinds of path are asserted differently: a static Layer 3/4 file must exist now, while a run-time artifact such as `[topic-slug]-plan.md` must *not* exist yet — only its directory has to make sense.

This is the argument for the unit in one line. A tree-of-files assertion cannot find a broken seam; only running it can.

---

## Test Contract

**Status (2026-09-13): Unit 5 tasks 5.1–5.13 are complete. `__tests__/seam-driver.test.ts` — 27 tests. `create-agent-harness` runs 650 passed / 2 skipped (622 before Unit 5; the 28 new tests are 27 driver + 1 reference-path resolution in `icm-scaffold.test.ts`).**

- **The pinned typed exit (task 5.11 / OQ3).** A test asserts the documented `--json-schema` option is passed with `STAGE_EXIT_SCHEMA`, and that the typed field shape is `structured_output` on the terminal `result` event — the field names OQ3 left open, now pinned in source and fixtures.
- **Typed field, not scrape (OQ4).** `reads the typed exit off the terminal result event` plus `does not scrape prose from the transcript tail` — the fallback's absence is asserted, so re-adding it dead would be caught.
- **Three failure semantics (tasks 5.6, 5.7).** Fixture-driven, no live call: valid structured exit → `done`; malformed tail → `corrective-retry`; absent tail → `needs-review`.
- **The corrective retry is capped at one, on the same session (3.6).** `recovers on the single corrective re-invoke, on the same session` and `never re-invokes more than once — a second failure is needs-review`.
- **No timers, on any invocation (task 5.8).** The invocation record is inspected across initial **and** corrective invocations; any timeout key fails the test.
- **The `--bare` guard (task 5.13).** `never passes --bare for a harness run` — and `assertNoBare` throws, so the assertion has a real guard behind it rather than a comment.
- **Denials are data (task 5.12).** Tool/scope are surfaced as a named output; a clean run reports no denial; and `records only the denial tool/scope — no credential material` pins the security rule.
- **Progress lives outside the ledger schema (task 5.4).** The sidecar carries stage/status/outputs as JSON in the run directory.
- **The mapping needs no migration (task 5.5).** `maps to exactly the existing columns — no migration, no new column` asserts the row's key set equals the existing columns exactly, and `timeout_min` is `0` — the no-timer sentinel, not the schema default of 30.
- **The run-local ledger (D2).** `writes the run-local ledger, never the operator bridge ledger` — containment by path, with the bridge path asserted absent.
- **The proof artifacts (task 5.10).** The transcript is preserved **verbatim** (an injected marker survives, so a non-empty-file check cannot pass by accident), and `keeps the composed prompt, because the transcript cannot prove the input` asserts the contract text, its resolved Inputs, and the conversation row are all in `prompt.md`.
- **The Inputs table is resolved, not the whole workspace (task 5.3).** Header/separator dropped; a resolved file scoped to its named section rather than read whole; an unresolvable row **reported** rather than silently dropped; the contract alone fed when nothing resolves; `01` resolves to the catalog-emitted `01-plan` dir; a prefix id is not confused with a longer one; and a missing stage **fails loudly** rather than inventing a path.
- **The reference-path guard (task 5.9's finding).** `icm-scaffold.test.ts` resolves every relative `.md` path named in every stage contract from that stage's directory — static layer files must exist, run-time artifacts must have a resolvable directory.
- **Falsified before commit.** Four mutations, each caught by its target assertion and reverted: `runLocalLedgerPath` pointed at the live bridge ledger → the D2 containment test red; the transcript written empty → the verbatim-transcript test red; `prompt.md` not written → the proof-of-input test red; the contract replaced by a first-line-only re-derivation → the same test red (the seam having moved). Unmutated run 27/27 green, and 26/26 before the final mutation pass.
- **Regression gates (unchanged).** `create-agent-harness` 650 passed / 2 skipped; lint (`tsc --noEmit`) clean; `path-guard.mjs` clean; `healthcheck.mjs` 8/8 HEALTHY; `check-runner-coverage.mjs` ok; `npm run gen:templates` idempotent (no diff after regeneration).
- **Byte-equality without the flag is untouched.** The seam is a separate subcommand; `--icm`/`--answers` emission is unchanged, so ADR-279's guarantee holds.

### Live acceptance run (task 5.9, hand-verified)

`harness scaffold h --template vertical:coding --icm --answers examples/icm-onboarding/answers.example.json`, then `harness seam <dir> 01 --request "…" --allow-writes`:

- Run id `20260913-213702-0001`, stage `01` → `done` (`stage_exit` present), one output artifact under `stages/01-plan/output/`.
- `prompt.md` carries the contract verbatim plus the resolved-Inputs block and the conversation row; `stream-json` does **not** echo the prompt, which is why this file exists.
- Sidecar: `awaiting_checkpoint_decision` with the artifact path. Ledger: **1 row**, `timeout_min=0`, in `runs/<runId>/ledger.db`.
- The operator ledger was **unchanged**: 5 rows before and after, zero seam run ids.
- One earlier live run (`20260913-213358-0001`) confirmed the reference-path defect and the fix.

**The proof artifacts are deliberately NOT committed (task 5.10, read against the visibility rule).** Task 5.10 says to "keep the transcript and sidecar as the proof artifacts", but the tasks file's own Public-visibility note forbids committing **machine-specific paths** — and the transcript is full of them: the operator's home-dir CLI config, four plugin-cache paths, and the run's temp-directory scaffold root. Committing it would breach the rule that governs every other artifact in this feature, and the transcripts run to ~134 KB each.

They are therefore kept **outside the repository**, in operator storage alongside the run directories, and the ADR records what they show rather than shipping them. A reader who wants the raw evidence has the run id, the commands, and the location; a reader of the public repo gets no operator paths. The *durable* proof in-repo is the deterministic fixture suite, which needs no live call. Note that the transcript also contains **no** credentials — the denials and tool inputs carry tool/scope only, which is what decision 8 requires.

### The three pre-D2 rows on the operator ledger (still present, not this repo's to touch)

The three rows written before the containment fix remain in whichever live bridge ledger produced them. They are identifiable by `timeout_min: 0` — the no-timer sentinel — which no ordinary bridge row carries (real rows use the schema default of 30), and by their temp-directory `cwd` values, which no legitimate task row has. They are left in place on purpose: **removing rows from live operational state is the operator's call, not a test's side effect.** The fix prevents recurrence; it does not retroactively clean up. This ADR records the defect and its shape rather than the operator's directory layout, which does not belong in a public fork — the same rule that keeps the raw transcripts out.

---

## References

- `docs/specs/01-spec-icm-generator-emission/01-tasks-icm-generator-emission.md` §5.0 (tasks 5.1–5.13), `01-spec-icm-generator-emission.md` (Open Questions 3, 4; Architectural deviations; Security Considerations)
- ADR-279 (fork pin policy, `--icm` opt-in, `.icm/` overlay, `CLAUDE.md` ownership), ADR-280 (fork CI triggers), ADR-281 (headless onboarding) — this ADR extends them and amends none
- `packages/create-agent-harness/src/{seam-driver.ts,seam-ledger.ts,seam-cmd.ts,subcommands.ts}`, `__tests__/seam-driver.test.ts`, `__tests__/icm-scaffold.test.ts`
- `templates/catalog.def.mjs`, `templates/{minimal,vertical_coding}/.icm/**` (the reference-path fix), `scripts/gen-templates.mjs`
- `claude_bridge/ledger.py` (operator workspace) — `insert_task` / `_default_db_path`, the live-ledger hazard D2 guards
- Claude Code CLI **2.1.265** (`--output-format stream-json`, `--json-schema`, `structured_output`, `permission_denials`)
- Upstream: `ruvnet/metaharness` @ `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`
