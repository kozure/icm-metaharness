# 01-audit-remove-ui-components.md

Planning audit of `01-tasks-remove-ui-components.md` against `01-spec-remove-ui-components.md`. **Run 2 — 2026-09-16 (post-remediation). Run 1's findings are preserved in the Re-Audit Delta below.**

## Executive Summary

- Overall Status: **PASS**
- Required Gate Failures: **0** (Run 1: 3 — all three remediated)
- Flagged Risks: **0 open** (Run 1: 2 — both converted into planned work)

## Gateboard

| Gate | Status | Evidence | Exact fix target |
| --- | --- | --- | --- |
| Requirement-to-test traceability | PASS | FR-1/FR-2 guarded by 1.16 + 1.17; FR-7 by 2.16 + 2.17 | — |
| Requirement-to-test traceability (inversion completeness) | PASS | 3.8/3.9 plan the two missed files; proof artifacts state the verified 7 | — |
| Proof artifact verifiability | PASS | 1.0 baseline re-anchored on `mcp-capabilities.json` + the 1.8 fixture | — |
| Repository standards consistency | PASS | 9 guideline sources read; no conflict; `AGENTS.md` absent | — |
| Open question resolution | PASS | All 6 spec OQs (`:177-181`) defaulted explicitly in tasks; OQ3's branch pre-specified and its outcome now recorded in 4.3 | — |
| Regression-risk blind spots | PASS | Mutations raised 3 → 5 (3.10-3.14), covering every inverted guard | — |
| Non-goal leakage | PASS | 4.10 records the FR-4/FR-5 reading in ADR-284; 4.12 still leaves historical records alone | — |

## Standards Evidence Table (Required)

| Source File | Read | Standards Extracted | Conflicts |
| --- | --- | --- | --- |
| `README.md` | yes | Documented gate order `build` → `test` → `healthcheck`; test count / CI-matrix claims that UI removal will invalidate | none |
| `CONTRIBUTING.md` | yes | "Every load-bearing change requires either updating an existing ADR or adding a new one"; TS tests are vitest; `scripts/smoke.mjs` is the pre-publish gate | none |
| `docs/adrs/INDEX.md` | yes | Ratified ADRs are amended by follow-on, never edited in place; new ADRs append, never renumber | none |
| `package.json` | yes | `workspaces: ['packages/*']` excludes the SPA; `test` = workspace fan-out with `pretest` build | none |
| `.github/workflows/ci.yml` | yes | Fork disposition header block is the durable ledger; triggers on `[main]` only | none |
| `FORK-RESYNC.md` | yes | Disposition table + "remove it again if reintroduced" paragraph are the re-sync mechanism | none |
| `vitest.config.ts` | yes | Test discovery globs are `packages/*/__tests__/**` and `__tests__/**` — new tests must land there | none |
| `~/DEV/CLAUDE.md` (nearest parent) | yes | `~/DEV` is not a repo; a project's own `AGENTS.md`/`CLAUDE.md` is authoritative inside it | none |
| `apps/web-ui/README.md` | yes | Documents the surface being deleted; nothing carries forward | n/a — deleted by this work |
| `AGENTS.md` | not found | Searched repo root and `~/DEV`; neither exists | — |

## Findings — Run 1 record (all closed in Run 2)

*The findings below are the Run 1 report, preserved verbatim as the audit trail. Every item is now closed; see the Re-Audit Delta for the per-item disposition. Read them as history, not as open work.*

### REQUIRED Failures (max 3 in main report)

1. **Three functional requirements have no planned test artifact — CLI proofs only — and none of the three is mechanically guarded today.**
   - Missing item: Unit 1 FR-1 (generator writes no UI path), Unit 1 FR-2 (`manifest.surface` union narrowed to `'cli'`), and Unit 2 FR-7 (`swe-pareto.json` relocated with both consumers repointed) are each evidenced only by a `grep`/`node` proof artifact. No task adds or inverts a test that would go red if the coupling returned, so the gate's "at least one planned test artifact per functional requirement" is unmet for these three.
   - Verified that no existing test closes the gap: re-adding the `apps/web-ui` write in `gen-templates.mjs` fails nothing (the write is a `mkdir -p`); re-widening `manifest.ts:16` to `surface?: 'cli' | 'web-ui'` fails nothing, because widening a union is backward-compatible and so invisible to `tsc --noEmit`; and `grep -rn swe-pareto __tests__/ packages/*/__tests__/` returns zero hits.
   - Noted fairly — there IS adjacent coverage that does **not** satisfy the gate: `__tests__/manifest-kernel-version.test.ts:41,59` asserts the scaffolded `manifest.meta.surface` *value* is `'cli'`. That guards emitted behavior, not the type union FR-2 asks to narrow, and its own comment at `:10` still describes `'web-ui'` as a live value — so it neither covers FR-2 nor would catch a reinstatement.
   - File section to edit: `## Tasks > 1.0 Tasks` (add 1.16), `## Tasks > 2.0 Tasks` (add 2.16).
   - Acceptance condition: after remediation, the task list names a test for FR-1, FR-2, and FR-7, each shown falsifiable — consistent with the repo's existing source-assertion pattern at `__tests__/path-handling.test.ts:104`, which asserts `SCAN_DIRS` source text rather than runtime behavior.

2. **The spec's hard-fail-site count is both internally inconsistent and incomplete; two unplanned files break Success Metric 4.**
   - Missing item, part (a) — the spec contradicts itself. Unit 3's Functional Requirements (`:76-82`) enumerate **5** inversions (`path-handling`, `sbom`, `workflows`, `packages/arc-agi-3-chatgpt/__tests__/package.test.ts`, `audit-deps`), while Goals (`:15`), the Unit 3 Proof Artifacts (`:92`), and Success Metric 4 (`:172`) all say **4**: *"all 4 hard-failing sites inverted, not removed"*. The two counts cannot both be right.
   - Missing item, part (b) — two further files hard-fail on removals the spec does not count at all. Sub-task 2.6 deletes the `pages()` check, which fails `__tests__/healthcheck.test.ts` at three distinct sites: `:35` (the check-name list contains `'pages'`), `:34` (`/healthcheck — 8 checks/`; the count becomes 7 — verified `CHECKS` is what `Object.keys(CHECKS)` counts at `scripts/healthcheck.mjs:332`), and `:45` (`results).toHaveLength(8)`), plus `:89-97` (`--check=pages` assertions, which reference a check name that no longer exists). Sub-task 2.7 deletes the probe wiring, failing `__tests__/release.test.ts:96` (`scripts/preflight.mjs[^]*--probe-pages` in `release.mjs` source) and `:103-104` (`probePages = args.has('--probe-pages')` and `healthcheck.mjs --probe-pages` in `preflight.mjs`).
   - Net verified count: **7 test files** hard-fail — the 5 Unit 3 enumerates, plus `healthcheck.test.ts` and `release.test.ts`. Success Metric 4 cannot hold as written, and neither can the Goals claim.
   - Noted fairly: spec OQ#1 *does* anticipate the mechanism — "`healthcheck`'s printed check set shrinks by one, and `release.mjs`'s 'preflight clean (incl. live Studio probe)' log line changes wording." So the spec saw the behavioral consequence but never carried it through to the two test files that pin it. The gap is one of traceability, not of understanding.
   - File section to edit: `## Tasks > 3.0 Tasks` (add 3.13 and 3.14, extending the mutation set), `#### 3.0 Proof Artifact(s)` (state the verified 7-file count).
   - Acceptance condition: every code path removed by 2.6/2.7 has a corresponding inverted or updated assertion, and `npm test` is green at the end of 3.0 with no test file deleted. **The spec's own wording is not edited** — Phase 1 artifacts are ratified; the drift is recorded here so Phase 4 validation reads "7 files, not 4".

3. **A 1.0 proof artifact is not reproducible after the work it proves.**
   - Missing item: 1.0's third artifact asserts the registered tool list "equals the pre-removal baseline minus zero entries". After the deletion, a reviewer cannot reproduce that baseline — the comparison direction is unrecoverable. The artifact is observable but not reproducible, failing the evidence quality bar.
   - File section to edit: `#### 1.0 Proof Artifact(s)`.
   - Acceptance condition: the artifact names a **durable** baseline. Sub-task 1.13(c) already provides one — the registered tool-name set must equal `packages/arc-agi-3-chatgpt/.harness/mcp-capabilities.json`'s per-lane `tools` lists, a tracked file that survives the removal. The artifact wording must cite that, and additionally require a one-time pre-removal capture (recorded in ADR-284 or the 1.13 test fixture) so the baseline is auditable rather than asserted.

### FLAG Findings (max 2 in main report)

1. **`docs/PRIME_AGENT_LOOP.md` straddles the FR-4 (scrub live docs) / FR-5 (preserve history) boundary.**
   - Risk: the file mixes one live instruction — `:18`, `npm --prefix apps/web-ui install` — with DONE completion records at `:33-39` that narrate `web-ui` parity work. Sub-task 4.10 scrubs the former and keeps the latter on my judgment. If a reviewer reads FR-4 literally over that file, the task list under-delivers; if FR-5 dominates, it over-delivers. The spec does not resolve which applies to this file, and Non-Goal 5 ("no dream-cycle gist is rewritten") protects *gist* files but says nothing about this one.
   - Suggested remediation: either (a) keep 4.10 as written and add one sentence to ADR-284 recording the live-vs-historical reading for this file, or (b) have 4.10 reword only the *path* at `:18` (e.g. to the CLI equivalent) and leave the surrounding narrative untouched. Needs the maintainer's call, since it is a documentation-history judgment, not a mechanical edit.
   - Related sub-finding, same class: `packages/darwin-mode/LEARNINGS.md:1154` references `apps/web-ui/public/assets/swe-pareto.json` but FR-5 protects historical research records — sub-task 4.12 leaves it alone deliberately.

2. **The README's leaderboard section loses its hosting surface with no agreed replacement, and its numbers go stale.**
   - Risk: `README.md:405` links `https://ruvnet.github.io/metaharness/cost-pareto.html`, and the page itself (`apps/web-ui/public/cost-pareto.html`) plus `og.png` are in-tree assets of the deleted SPA tree. Sub-task 4.8 asks for an editorial rewrite that preserves the results table and `SUBMISSIONS.md` pointer while dropping the live-URL dependence — but the spec's FR-4 enumerates only "10 matching lines" and does not decide whether the Cost-Pareto section's *hosting* is knowingly retired. Separately, `README.md:341-342` assert "2,254 passing" across 246 files and a live Studio URL; the passing count will change with this work, so an unscrubbed count becomes a false claim.
   - Suggested remediation: confirm in ADR-284 that the leaderboard's hosting is retired while its data and `SUBMISSIONS.md` path are preserved, and add a sub-task updating `README.md:341`'s test-count claim to whatever the post-removal suite reports (or removing the number if it cannot be stated accurately).

## User-Approved Remediation Plan

- **Applied — 2026-09-16.** Chris approved remediation (his message: "Approve remediation"); no (a)/(b) selection was given for FLAG 1, so R6 was applied as option **(a)**, recorded as an assumption in 4.10 itself.
- All seven edits landed in `01-tasks-remove-ui-components.md`. The findings above are preserved as the Run 1 record and are **not** rewritten.

| # | Gate | Edit target | Change applied |
| --- | --- | --- | --- |
| R1 | Traceability | `1.0 Tasks` | Added 1.16 (FR-1 generator-writes-no-`apps/` guard + FR-2 `surface`-union source assertion) and 1.17 (falsifiability: re-added generator write, re-widened union). FR-2's source assertion is the point — a re-widened union passes `tsc --noEmit`. |
| R2 | Traceability | `2.0 Tasks` | Added 2.16 (FR-7 guard: asset tracked, both consumers' declared paths **resolved**, not merely string-matched) and 2.17 (falsifiability, plus a stop-on-unenumerated-failure rule). |
| R3 | Traceability (inversion) | `3.0 Tasks` | Inverted the two missed files: 3.8 (`healthcheck.test.ts` — name list, 8→7 count banner, `toHaveLength`, `--check=pages` error-path rewrite) and 3.9 (`release.test.ts` — probe wiring asserted absent). Mutation set raised 3 → 5 via 3.13(d)/3.14(e). **Numbering note:** the proposed plan numbered these 3.13/3.14 because it assumed append-only; applied sequentially they are 3.8/3.9 for the inversions and 3.13/3.14 for the mutations, which is the same work under shifted numbers. |
| R4 | Traceability (inversion) | `3.0 Proof Artifact(s)` | Replaced "4 hard-fail sites" / "three mutations" with the verified **7 files** / **5 mutations**, and stated that the spec says 4 — the spec wording itself is not edited. |
| R5 | Proof verifiability | `1.0 Proof Artifact(s)`, `1.0 Tasks` | Re-anchored the baseline on `.harness/mcp-capabilities.json` (durable) **and** made 1.8's first action a pre-removal capture into `__tests__/fixtures/arc-pre-removal-tools.json`, asserted by 1.13(d). |
| R6 | FLAG 1 | `4.0 Tasks` | 4.10 records the live-vs-historical reading as option (a) in ADR-284, and notes (b) as a two-line change if he prefers it. |
| R7 | FLAG 2 | `4.0 Tasks` | Added 4.15 (post-removal test-count claim in `README.md:341-342`; update to the actual figure or drop it — never estimate) and 4.16 (record the Cost-Pareto hosting retirement in ADR-284). |

Two supporting edits went beyond the seven-item plan and are declared here rather than left implicit:

- `## Relevant Files` gained rows for the five files the new sub-tasks touch — `packages/arc-agi-3-chatgpt/__tests__/fixtures/arc-pre-removal-tools.json`, `packages/create-agent-harness/__tests__/generated-templates.test.ts`, `__tests__/research-asset-paths.test.ts`, `__tests__/healthcheck.test.ts`, `__tests__/release.test.ts` — so the table names every path the remediated task list references. The pre-existing `no-ui-surface.test.ts` row was left as it was; it already described the no-`ui://`-resource assertion accurately and needed no change.
- `1.0` and `2.0` Proof Artifact blocks each gained a `Test:` line citing their new guards (1.16/1.17, 2.16/2.17), so the traceability gate reads a test artifact per requirement rather than requiring the reader to infer one from the task list.

## Re-Audit Delta

**Run 1 → Run 2 (2026-09-16).** Run 1: FAIL, 3 required failures, 2 flags. Run 2: **PASS, 0 failures, 0 open flags.**

| Item | Run 1 | Run 2 | Closing evidence |
| --- | --- | --- | --- |
| FR-1 / FR-2 traceability | FAIL — CLI proof only | PASS | 1.16 + 1.17; falsifiable by a re-added `mkdir -p` write and a re-widened union |
| FR-7 traceability | FAIL — CLI proof only | PASS | 2.16 + 2.17; resolves the declared paths, catching a repoint to a dead path |
| Inversion completeness | FAIL — 7 hard-fail, 2 unplanned | PASS | 3.8 / 3.9 planned; proof artifacts state 7 |
| Proof-artifact verifiability (1.0) | FAIL — unreproducible baseline | PASS | Anchored on a tracked file + a committed fixture (1.8) |
| Mutation coverage | FLAG — 3 guards, 3 unmutated | PASS | 5 mutations (3.10-3.14), one per inverted guard |
| FLAG 1 — `PRIME_AGENT_LOOP.md` boundary | FLAG — needs maintainer call | PASS (as (a), recorded) | 4.10 states the reading; (b) remains a two-line change |
| FLAG 2 — leaderboard hosting + stale count | FLAG | PASS | 4.15 (count) + 4.16 (hosting, recorded in ADR-284) |

**Unchanged PASS gates:** repository standards consistency (9 sources), open-question resolution (all 6 defaults), non-goal leakage.

**Residual risk carried into implementation, not waived:** the spec's own count text (`:15`, `:92`, `:172`) still says 4. Remediation recorded the verified 7 in the task list and here, but did not edit the ratified spec — so Phase 4 validation must read this audit for the count, and a reader who consults only the spec will still see 4. That is deliberate (Phase 1 artifacts are ratified) and is the one known documentation drift this work accepts.

